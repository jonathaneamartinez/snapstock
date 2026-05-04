/**
 * Vercel Serverless Function: /api/img-proxy?url=...
 *
 * Fetchea imágenes de pokemontcg.io (u otros dominios permitidos) server-side
 * y las devuelve con Access-Control-Allow-Origin: * para que el canvas del
 * browser pueda usarlas sin restricciones CORS.
 */
export default async function handler(req, res) {
  const { url } = req.query

  if (!url) {
    res.status(400).end('Missing url param')
    return
  }

  // Solo permitir dominios de imágenes conocidos
  let parsed
  try {
    parsed = new URL(decodeURIComponent(url))
  } catch {
    res.status(400).end('Invalid URL')
    return
  }

  const ALLOWED = [
    'images.pokemontcg.io',
    'supabase.co',
    'cdn.pokemontcg.io',
  ]
  const hostOk = ALLOWED.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))
  if (!hostOk) {
    res.status(403).end('Domain not allowed')
    return
  }

  try {
    const upstream = await fetch(decodeURIComponent(url))
    if (!upstream.ok) {
      res.status(upstream.status).end()
      return
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    const buffer = await upstream.arrayBuffer()

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable') // 1 semana
    res.setHeader('Content-Type', contentType)
    res.end(Buffer.from(buffer))
  } catch (err) {
    console.error('[img-proxy] error:', err.message)
    res.status(500).end('Proxy error')
  }
}
