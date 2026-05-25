/**
 * Normaliza cualquier variante de código de idioma al código canónico
 * que usa la UI (valores de IDIOMAS[].code).
 *
 * Problema histórico: el scanner guarda 'jp'/'cn', la UI usa 'ja'/'zh'.
 * Esta función resuelve la discrepancia en filtros y comparaciones.
 *
 * Ejemplos:
 *   normLang('jp')       → 'ja'
 *   normLang('japanese') → 'ja'
 *   normLang('cn')       → 'zh'
 *   normLang('JA')       → 'ja'
 *   normLang(null)       → 'en'
 *   normLang('')         → 'en'
 */
export function normLang(code) {
  const c = (code ?? '').toLowerCase().trim()
  if (!c) return 'en'
  if (['ja', 'jp', 'japanese'].includes(c)) return 'ja'
  if (['zh', 'cn', 'chinese'].includes(c))  return 'zh'
  if (['pt', 'br'].includes(c))             return 'pt'
  return c
}

/**
 * True si dos códigos de idioma representan el mismo idioma,
 * independientemente de la variante usada.
 */
export function sameLang(a, b) {
  return normLang(a) === normLang(b)
}
