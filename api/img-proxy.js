/**
 * Vercel Serverless Function: /api/img-proxy?url=...
 *
 * Fetchea imágenes de pokemontcg.io (u otros dominios permitidos) server-side
 * y las devuelve con Access-Control-Allow-Origin: * para que el canvas del
 * browser pueda usarlas sin restricciones CORS.
 */
export default async function handler(req, res) {
  // Preflight CORS (por si el browser lo pide)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { url } = req.query

  if (!url) {
    res.status(400).end('Missing url param')
    return
  }

  // Decodificar: req.query ya decodifica una vez, pero puede venir doble-encoded
  let decoded
  try {
    decoded = decodeURIComponent(url)
    // Si sigue teniendo %, intentar decodificar de nuevo (doble-encoded)
    if (decoded.includes('%')) decoded = decodeURIComponent(decoded)
  } catch {
    decoded = url
  }

  // Validar que sea una URL HTTPS válida (no IPs privadas)
  let parsed
  try {
    parsed = new URL(decoded)
  } catch {
    res.status(400).end('Invalid URL')
    return
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    res.status(400).end('Only http/https URLs allowed')
    return
  }

  // Bloquear IPs privadas / localhost para prevenir SSRF
  const host = parsed.hostname
  const BLOCKED = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
  ]
  if (BLOCKED.some(re => re.test(host))) {
    res.status(403).end('Private/localhost URLs not allowed')
    return
  }

  try {
    // Timeout de 8 s para no superar el límite de Vercel (10 s hobby / 60 s pro)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    const upstream = await fetch(decoded, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SnapStock-Proxy/1.0' },
    })
    clearTimeout(timer)

    if (!upstream.ok) {
      console.warn('[img-proxy] upstream error:', upstream.status, decoded)
      res.status(upstream.status).end(`Upstream ${upstream.status}`)
      return
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await upstream.arrayBuffer())

    if (!buffer.length) {
      res.status(502).end('Empty response from upstream')
      return
    }

    res.setHeader('Cache-Control', 'public, max-age=604800, immutable') // 1 semana
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', buffer.length)
    res.end(buffer)

  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'Timeout' : err?.message
    console.error('[img-proxy] error:', msg, decoded)
    res.status(err?.name === 'AbortError' ? 504 : 500).end(`Proxy error: ${msg}`)
  }
}
