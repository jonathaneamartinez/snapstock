/**
 * Traduce nombres de sets JP/CN al nombre en inglés que usan los coleccionistas.
 *
 * Fuentes:
 *   - JP: nombres exactos del pHash index (provenientes de TCGdex JP)
 *   - CN: los sets locales ya tienen nombre en inglés (derivado del slug de carpeta)
 *         → no necesitan traducción, pero se incluyen alias por si acaso
 *
 * Lógica: primero intenta por nombre exacto, luego por set_id, luego devuelve el original.
 */

// ── Nombres JP → Inglés ────────────────────────────────────────────────────────
// Generado a partir de los set_name reales en card_phash.json
const JP_BY_NAME = {
  // SV era
  'スカーレットex':            'Scarlet ex',
  'バイオレットex':            'Violet ex',
  'トリプレットビート':        'Triplet Beat',
  'ポケモンカード151':         'Pokémon Card 151',
  'スノーハザード':            'Snow Hazard',
  'クレイバースト':            'Clay Burst',
  'レイジングサーフ':          'Raging Surf',
  'シャイニートレジャーex':    'Shiny Treasure ex',
  'ワイルドフォース':          'Wild Force',
  'サイバージャッジ':          'Cyber Judge',
  'クリムゾンヘイズ':          'Crimson Haze',
  '変幻の仮面':                'Mask of Change',
  'ナイトワンダラー':          'Night Wanderer',
  'ステラミラクル':            'Stellar Miracle',
  '古代の咆哮':                'Ancient Roar',
  '未来の一閃':                'Future Flash',
  '黒炎の支配者':              'Ruler of the Black Flame',
  '楽園ドラゴーナ':            'Paradise Dragona',
  '超電ブレイカー':            'Super Electric Breaker',
  'テラスタルフェスex':        'Terastal Festival ex',
  'テラスタルフェスティバルex':'Terastal Festival ex',
  'バトルパートナーズ':        'Battle Partners',
  '熱風のアリーナ':            'Hot Air Arena',
  'ロケット団の栄光':          'Glory of Team Rocket',
  // SwSH era
  'VSTARユニバース':           'VSTAR Universe',
  'パラダイムトリガー':        'Paradigm Trigger',
  '白熱のアルカナ':            'Incandescent Arcana',
  'ロストアビス':              'Lost Abyss',
  'ポケモンGO':                'Pokémon GO',
  'スターバース':              'Star Birth',
  'バトルリージョン':          'Battle Region',
  'フュージョンアーツ':        'Fusion Arts',
  'イーブイヒーローズ':        'Eevee Heroes',
  '白銀のランス':              'Silver Lance',
  '漆黒のガイスト':            'Jet Black Spirit',
  '蒼空ストリーム':            'Sky Stream',
  '摩天パーフェクト':          'Towering Perfection',
  '双璧のファイター':          'Twin Fighter',
  '連撃マスター':              'Single Strike Master',
  'ムゲンゾーン':              'Infinity Zone',
  '反逆クラッシュ':            'Rebellion Crash',
  'デッキビルドBOX ステラミラクル': 'Deck Build BOX Stellar Miracle',
  // Starter sets
  'スターターセット テラスタイプ：ステラ ニンフィアex':  'Starter Set Terastal Stellar — Sylveon ex',
  'スターターセット テラスタイプ：ステラ ソウブレイズex': 'Starter Set Terastal Stellar — Ceruledge ex',
  'スターターセット テラスタイプ：ステ':                'Starter Set Terastal Stellar',
  // Newer 2025 sets (si se agregan al índice)
  'ニンジャスピナー':          'Ninja Spinner',
  'ニヒルゼロ':               'Nihil Zero',
  'メガドリームex':           'Mega Dream ex',
  'インフェルノex':           'Inferno ex',
  'マクドナルドプロモ2025':    "McDonald's Promo 2025",
  'メガシンフォニア':          'Mega Symphonia',
  'メガブレイブ':             'Mega Brave',
  '白のオーラ':               'White Flare',
  '黒のオーラ':               'Black Bolt',
}

// ── Set IDs JP (TCGdex) → Inglés ──────────────────────────────────────────────
const JP_BY_ID = {
  'SV1S': 'Scarlet ex',
  'SV1V': 'Violet ex',
  'SV1a': 'Triplet Beat',
  'SV2a': 'Pokémon Card 151',
  'SV2P': 'Snow Hazard',
  'SV2D': 'Clay Burst',
  'SV3a': 'Raging Surf',
  'SV4a': 'Shiny Treasure ex',
  'SV5K': 'Wild Force',
  'SV5M': 'Cyber Judge',
  'SV5a': 'Crimson Haze',
  'SV6':  'Mask of Change',
  'SV7':  'Stellar Miracle',
  'SV7a': 'Paradise Dragona',
  'SV8':  'Super Electric Breaker',
  'SV8a': 'Terastal Festival ex',
  'SV9':  'Battle Partners',
  'SV9a': 'Hot Air Arena',
  'SV10': 'Glory of Team Rocket',
  'SV3':  'Ruler of the Black Flame',
  'SV4K': 'Ancient Roar',
  'SV4M': 'Future Flash',
  'S12':  'Paradigm Trigger',
  'S12a': 'VSTAR Universe',
  'S9':   'Star Birth',
  'S9a':  'Battle Region',
  'SVK':  'Deck Build BOX Stellar Miracle',
  'SVLN': 'Starter Set Terastal Stellar — Sylveon ex',
  'SVLS': 'Starter Set Terastal Stellar — Ceruledge ex',
}

/**
 * Detecta si una cadena contiene caracteres japoneses o chinos.
 */
function hasAsianChars(str) {
  return /[　-鿿豈-﫿＀-￯]/.test(str)
}

/**
 * Traduce un nombre de set al inglés.
 * - Primero intenta por nombre exacto (JP map).
 * - Luego intenta por set_id (JP_BY_ID).
 * - Si el nombre ya es inglés (no tiene kanji/kana), lo devuelve como está.
 * - Fallback: devuelve el original.
 *
 * @param {string} name    — nombre del set (puede ser JP o EN)
 * @param {string} [setId] — set_id opcional para mejorar la búsqueda
 */
export function translateSetName(name, setId = '') {
  if (!name) return name

  // 1. Buscar por nombre exacto
  if (JP_BY_NAME[name]) return JP_BY_NAME[name]

  // 2. Buscar por set_id
  const upperSetId = (setId || '').toUpperCase()
  if (upperSetId && JP_BY_ID[upperSetId]) return JP_BY_ID[upperSetId]

  // 3. Si el nombre no tiene caracteres asiáticos, ya está en inglés
  if (!hasAsianChars(name)) return name

  // 4. Fallback: devolver original (set nuevo no mapeado aún)
  return name
}
