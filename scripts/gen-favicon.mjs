/**
 * Генерирует public/favicon.ico из public/icon-256.png.
 * Windows иногда использует .ico для иконки ярлыка на рабочем столе.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pngToIco from 'png-to-ico'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')
const src = path.join(publicDir, 'icon-256.png')
const dest = path.join(publicDir, 'favicon.ico')

if (!fs.existsSync(src)) {
  console.warn('scripts/gen-favicon: icon-256.png не найден, пропуск генерации favicon.ico')
  process.exit(0)
}

const buf = await pngToIco(src)
fs.writeFileSync(dest, buf)
console.log('scripts/gen-favicon: записан public/favicon.ico')
