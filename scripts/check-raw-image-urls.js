/**
 * check-raw-image-urls.js
 *
 * Detecta uso directo de <img src={...image_url...}> en componentes JSX
 * sin pasar por useCardImage o CardImage. Esto puede mostrar imágenes
 * incorrectas cuando image_url en Supabase apunta a la carta equivocada.
 *
 * Uso: node scripts/check-raw-image-urls.js
 * Retorna exit code 1 si encuentra violaciones.
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname } from 'path'

const SRC_DIR = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

// Patrones que indican imagen directa sin verificar.
// NOTA: .imagen (sin _url) viene del scanner backend — ya está verificado, no se controla acá.
const BANNED = [
  /src=\{[^}]*image_url[^}]*\}/,
]

// Archivos/carpetas que quedan excluidos (scanner maneja sus propias imágenes)
const EXCLUDED = [
  'CardImage.jsx',
  'HoloCard.jsx',
  'CardResult.jsx',
  'useCardImage.js',
  'imageCache',
  'scanner',
]

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...walk(full))
    } else if (['.jsx', '.tsx', '.js', '.ts'].includes(extname(entry))) {
      files.push(full)
    }
  }
  return files
}

const files = walk(SRC_DIR).filter(f => !EXCLUDED.some(ex => f.includes(ex)))

let violations = 0

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const lines   = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
    for (const pattern of BANNED) {
      if (pattern.test(line)) {
        const rel = file.replace(SRC_DIR, 'src').replace(/\\/g, '/')
        console.error(`❌  ${rel}:${i + 1}  →  ${line.trim()}`)
        violations++
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} violation(s) found.`)
  console.error('Usá useCardImage() o <CardImage> en lugar de <img src={...image_url}> directo.\n')
  process.exit(1)
} else {
  console.log('✅  Sin imágenes directas de Supabase encontradas.')
  process.exit(0)
}
