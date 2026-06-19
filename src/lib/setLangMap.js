// Auto-generado desde jp_en_set_map.json (research TCGdex). EN set <-> JP set(s).
// Para el match cross-idioma: varios sets JP componen 1 set EN.
export const SET_LANG_MAP = {
 "enToJp": {
  "base set": [
   "闇からの挑戦"
  ],
  "neo genesis": [
   "闇、そして光へ...",
   "ポケモンカード★VS"
  ],
  "expedition base set": [
   "基本拡張パック"
  ],
  "aquapolis": [
   "海からの風"
  ],
  "skyridge": [
   "裂けた大地",
   "神秘なる山"
  ],
  "firered leafgreen": [
   "伝説の飛翔"
  ],
  "deoxys": [
   "蒼空の激突"
  ],
  "team rocket returns": [
   "ロケット団の逆襲"
  ],
  "delta species": [
   "ホロンの研究塔"
  ],
  "holon phantoms": [
   "ホロンの幻影"
  ],
  "dragon frontiers": [
   "さいはての攻防"
  ],
  "phantasmal flames": [
   "インフェルノX"
  ],
  "mega evolution": [
   "メガブレイブ",
   "メガシンフォニア"
  ],
  "perfect order": [
   "ムニキスゼロ"
  ],
  "crown zenith": [
   "VSTARユニバース"
  ],
  "silver tempest": [
   "パラダイムトリガー"
  ],
  "brilliant stars": [
   "スターバース"
  ],
  "astral radiance": [
   "バトルリージョン"
  ],
  "surging sparks": [
   "スターターセット テラスタイプ：ステラ ニンフィアex",
   "スターターセット テラスタイプ：ステラ ソウブレイズex",
   "楽園ドラゴーナ",
   "超電ブレイカー"
  ],
  "scarlet violet": [
   "スカーレットex",
   "バイオレットex"
  ],
  "black bolt": [
   "ブラックボルト"
  ],
  "paradox rift": [
   "レイジングサーフ",
   "古代の咆哮",
   "未来の一閃"
  ],
  "151": [
   "ポケモンカード151"
  ],
  "stellar crown": [
   "ステラミラクル"
  ],
  "paldea evolved": [
   "クレイバースト",
   "スノーハザード"
  ],
  "genetic apex": [
   "デッキビルドBOX ステラミラクル"
  ],
  "twilight masquerade": [
   "変幻の仮面",
   "クリムゾンヘイズ"
  ],
  "temporal forces": [
   "ワイルドフォース"
  ],
  "obsidian flames": [
   "黒炎の支配者"
  ],
  "white flare": [
   "ホワイトフレア"
  ],
  "paldean fates": [
   "レイジングサーフ"
  ],
  "destined rivals": [
   "ロケット団の栄光",
   "熱風のアリーナ"
  ],
  "journey together": [
   "バトルパートナーズ"
  ]
 },
 "jaToEn": {
  "闇からの挑戦": "Base Set",
  "闇、そして光へ...": "Neo Genesis",
  "ポケモンカード★VS": "Neo Genesis",
  "基本拡張パック": "Expedition Base Set",
  "海からの風": "Aquapolis",
  "裂けた大地": "Skyridge",
  "神秘なる山": "Skyridge",
  "伝説の飛翔": "FireRed & LeafGreen",
  "蒼空の激突": "Deoxys",
  "ロケット団の逆襲": "Team Rocket Returns",
  "ホロンの研究塔": "Delta Species",
  "ホロンの幻影": "Holon Phantoms",
  "さいはての攻防": "Dragon Frontiers",
  "インフェルノX": "Phantasmal Flames",
  "メガブレイブ": "Mega Evolution",
  "ムニキスゼロ": "Perfect Order",
  "メガシンフォニア": "Mega Evolution",
  "VSTARユニバース": "Crown Zenith",
  "パラダイムトリガー": "Silver Tempest",
  "スターバース": "Brilliant Stars",
  "バトルリージョン": "Astral Radiance",
  "スターターセット テラスタイプ：ステラ ニンフィアex": "Surging Sparks",
  "スカーレットex": "Scarlet & Violet",
  "ブラックボルト": "Black Bolt",
  "レイジングサーフ": "Paldean Fates",
  "ポケモンカード151": "151",
  "ステラミラクル": "Stellar Crown",
  "スターターセット テラスタイプ：ステラ ソウブレイズex": "Surging Sparks",
  "古代の咆哮": "Paradox Rift",
  "クレイバースト": "Paldea Evolved",
  "デッキビルドBOX ステラミラクル": "Genetic Apex",
  "変幻の仮面": "Twilight Masquerade",
  "クリムゾンヘイズ": "Twilight Masquerade",
  "ワイルドフォース": "Temporal Forces",
  "スノーハザード": "Paldea Evolved",
  "バイオレットex": "Scarlet & Violet",
  "黒炎の支配者": "Obsidian Flames",
  "ホワイトフレア": "White Flare",
  "未来の一閃": "Paradox Rift",
  "楽園ドラゴーナ": "Surging Sparks",
  "超電ブレイカー": "Surging Sparks",
  "ロケット団の栄光": "Destined Rivals",
  "熱風のアリーナ": "Destined Rivals",
  "バトルパートナーズ": "Journey Together"
 }
}

const norm = (s) => (s||'').replace(/^pokemon\s+/i,'').replace(/&amp;/g,'&').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
export function jpSetsForEnSet(enSetName) { return SET_LANG_MAP.enToJp[norm(enSetName)] || [] }
export function enSetForJpSet(jpSetName) { return SET_LANG_MAP.jaToEn[jpSetName] || null }
