const BASE = import.meta.env.VITE_SCANNER_URL

export const scannerApi = {
  health: () =>
    fetch(`${BASE}/health`).then(r => r.json()),

  identificar: (imagen_base64, store_id, idioma = 'en') =>
    fetch(`${BASE}/scanner/identificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imagen_base64, store_id, idioma }),
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

  /**
   * Busca la URL de imagen R2 para una carta por nombre + número + idioma.
   * Usa el índice local card_phash.json del backend — funciona para EN, JP y CN.
   * @returns {Promise<string|null>} URL pública de R2, o null si no se encuentra.
   */
  cardImageUrl: (name, number, lang = 'en', { setId = '', holo = false } = {}) => {
    const params = new URLSearchParams({
      name,
      number: String(number).split('/')[0].replace(/^0+/, '') || '0',
      lang,
      ...(setId ? { set_id: setId } : {}),
      ...(holo  ? { holo: '1'    } : {}),
    })
    return fetch(`${BASE}/card-image-url?${params}`)
      .then(r => r.json())
      .then(d => d.url ?? null)
      .catch(() => null)
  },

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
