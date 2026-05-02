const BASE = import.meta.env.VITE_SCANNER_URL

export const scannerApi = {
  health: () =>
    fetch(`${BASE}/health`).then(r => r.json()),

  identificar: (imagen_base64, store_id) =>
    fetch(`${BASE}/scanner/identificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagen_base64, store_id }),
    }).then(r => r.json()),

  confirmar: (payload) =>
    fetch(`${BASE}/scanner/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()),

  buscar: (q, idioma = 'en') =>
    fetch(`${BASE}/scanner/search?q=${encodeURIComponent(q)}&idioma=${idioma}`)
      .then(r => r.json()),

  identificarSellado: (imagen_base64) =>
    fetch(`${BASE}/scanner/identificar-sellado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagen_base64 }),
    }).then(r => r.json()),

  confirmarSellado: (payload) =>
    fetch(`${BASE}/scanner/confirmar-sellado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json()),
}
