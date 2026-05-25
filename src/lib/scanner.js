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

  buscar: (q, idioma = 'en', setId = '', limit = 5) => {
    const params = new URLSearchParams({ q, idioma })
    if (setId)    params.set('set_id', setId)
    if (limit !== 5) params.set('limit', String(limit))
    return fetch(`${BASE}/scanner/search?${params}`).then(r => r.json())
  },

  /**
   * Devuelve los sets disponibles en el índice local para un idioma (jp/cn/en).
   * @returns {Promise<Array<{id:string, name:string}>>}
   */
  availableSets: (lang = 'en') =>
    fetch(`${BASE}/available-sets?lang=${lang}`)
      .then(r => r.json())
      .then(d => d.sets ?? [])
      .catch(() => []),

  /**
   * Busca la URL de imagen R2 para una carta por nombre + número + idioma.
   * Usa el índice local card_phash.json del backend — funciona para EN, JP y CN.
   * @returns {Promise<string|null>} URL pública de R2, o null si no se encuentra.
   */
  /**
   * @returns {Promise<{url:string|null, set_name:string|null, number:string|null}>}
   * number vacío = buscar por nombre solo (útil al cambiar idioma, JP/CN tienen números distintos)
   */
  cardImageUrl: (name, number = '', lang = 'en', { setId = '', holo = false } = {}) => {
    const numNorm = number ? (String(number).split('/')[0].replace(/^0+/, '') || '') : ''
    const params = new URLSearchParams({
      name,
      lang,
      ...(numNorm ? { number: numNorm } : {}),
      ...(setId   ? { set_id: setId  } : {}),
      ...(holo    ? { holo: '1'      } : {}),
    })
    return fetch(`${BASE}/card-image-url?${params}`)
      .then(r => r.json())
      .then(d => ({ url: d.url ?? null, set_name: d.set_name ?? null, number: d.number ?? null }))
      .catch(() => ({ url: null, set_name: null, number: null }))
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
