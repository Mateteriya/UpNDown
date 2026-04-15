#!/usr/bin/env node
/**
 * Считает смещения для CSS-вспышки «ровно в заказ» под звезду в GameTable.tsx:
 * читает `exactStarPathD` и размеры SVG (width/height), viewBox.
 *
 * Рекомендация для index.css (как сейчас в вёрстке):
 *   - optical-x: центр bbox контура минус центр viewBox (горизонталь симметричной звезды);
 *   - optical-y: центроид контура минус центр viewBox (вертикаль по массе контура).
 *
 * Запуск из корня репозитория:
 *   node tools/exact-order-star-flash-offset.mjs
 *
 * При смене path `d` или размеров иконки — перезапустить и вставить вывод в src/index.css.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const gameTablePath = path.join(repoRoot, 'src', 'ui', 'GameTable.tsx')

function parseNumbersAfterCommand(segBody) {
  const normalized = segBody
    .replace(/,/g, ' ')
    .replace(/(\d)([+-])/g, '$1 $2')
    .trim()
  if (!normalized) return []
  return normalized.split(/\s+/).map((t) => Number(t))
}

/**
 * Минимальный разбор d: M m L l H h Z z (достаточно для exactStarPathD).
 */
function pathToVertices(d) {
  const segs = d.match(/[MmLlHhZz][^MmLlHhZz]*/g)
  if (!segs?.length) throw new Error('Не удалось разбить path на сегменты')
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  /** @type {Array<[number, number]>} */
  const verts = []

  for (const seg of segs) {
    const cmd = seg[0]
    const nums = parseNumbersAfterCommand(seg.slice(1))
    const up = cmd.toUpperCase()

    if (up === 'Z') {
      if (verts.length && (verts[verts.length - 1][0] !== sx || verts[verts.length - 1][1] !== sy)) {
        verts.push([sx, sy])
      }
      x = sx
      y = sy
      continue
    }

    let ni = 0
    const rel = cmd !== up

    if (up === 'M') {
      while (ni + 1 < nums.length) {
        const nx = rel ? x + nums[ni] : nums[ni]
        const ny = rel ? y + nums[ni + 1] : nums[ni + 1]
        ni += 2
        x = nx
        y = ny
        if (verts.length === 0) {
          sx = x
          sy = y
        }
        verts.push([x, y])
      }
      continue
    }

    if (up === 'L') {
      while (ni + 1 < nums.length) {
        x = rel ? x + nums[ni] : nums[ni]
        y = rel ? y + nums[ni + 1] : nums[ni + 1]
        ni += 2
        verts.push([x, y])
      }
      continue
    }

    if (up === 'H') {
      while (ni < nums.length) {
        x = rel ? x + nums[ni] : nums[ni]
        ni += 1
        verts.push([x, y])
      }
      continue
    }

    throw new Error(`Неподдерживаемая команда в path: ${cmd} (добавьте разбор или упростите d)`)
  }

  return verts
}

function polygonCentroid(pts) {
  const n = pts.length
  if (n < 3) throw new Error('Мало вершин для площади')
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const cross = pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    a += cross
    cx += (pts[i][0] + pts[j][0]) * cross
    cy += (pts[i][1] + pts[j][1]) * cross
  }
  a *= 0.5
  if (Math.abs(a) < 1e-8) throw new Error('Площадь контура ~0')
  cx /= 6 * a
  cy /= 6 * a
  return { cx, cy, area: a }
}

function bbox(pts) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [px, py] of pts) {
    minX = Math.min(minX, px)
    maxX = Math.max(maxX, px)
    minY = Math.min(minY, py)
    maxY = Math.max(maxY, py)
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    midX: (minX + maxX) / 2,
    midY: (minY + maxY) / 2,
  }
}

function extractFromGameTable(src) {
  const pathMatch = src.match(/const\s+exactStarPathD\s*=\s*'([^']+)'/)
  if (!pathMatch) throw new Error('Не найден exactStarPathD в GameTable.tsx')
  const d = pathMatch[1]

  const blockStart = src.indexOf("const exactStarPathD")
  const block = src.slice(blockStart, blockStart + 800)
  const svgMatch = block.match(/<svg[^>]*viewBox="([^"]+)"[^>]*width="(\d+)"[^>]*height="(\d+)"/)
  if (!svgMatch) throw new Error('Не найден <svg viewBox width height> сразу после exactStarPathD')
  const vbParts = svgMatch[1].trim().split(/\s+/).map(Number)
  if (vbParts.length !== 4) throw new Error(`viewBox ожидался из 4 чисел: ${svgMatch[1]}`)
  const [, , vbW, vbH] = vbParts
  const svgW = Number(svgMatch[2])
  const svgH = Number(svgMatch[3])

  return { d, vbW, vbH, svgW, svgH, vbX: vbParts[0], vbY: vbParts[1] }
}

function main() {
  const src = fs.readFileSync(gameTablePath, 'utf8')
  const { d, vbW, vbH, svgW, svgH, vbX, vbY } = extractFromGameTable(src)

  const pts = pathToVertices(d)
  const { cx, cy, area } = polygonCentroid(pts)
  const box = bbox(pts)

  const vbMidX = vbX + vbW / 2
  const vbMidY = vbY + vbH / 2
  const scaleX = svgW / vbW
  const scaleY = svgH / vbH

  const centroidDx = cx - vbMidX
  const centroidDy = cy - vbMidY
  const bboxDx = box.midX - vbMidX
  const bboxDy = box.midY - vbMidY

  const opticalCentroidX = centroidDx * scaleX
  const opticalCentroidY = centroidDy * scaleY
  const opticalBboxX = bboxDx * scaleX
  const opticalBboxY = bboxDy * scaleY

  /** Гибрид: X по центру bbox (симметрия звезды), Y по центроиду */
  const opticalHybridX = bboxDx * scaleX
  const opticalHybridY = centroidDy * scaleY

  console.log(`Файл: ${path.relative(repoRoot, gameTablePath)}`)
  console.log(`path d (первые 60 симв.): ${d.slice(0, 60)}…`)
  console.log(`viewBox: ${vbX} ${vbY} ${vbW} ${vbH}  → центр (${vbMidX}, ${vbMidY})`)
  console.log(`SVG: ${svgW}×${svgH} px  → масштаб (${scaleX}, ${scaleY})`)
  console.log(`Вершин контура: ${pts.length}, площадь (шнурок): ${area.toFixed(4)}`)
  console.log('')
  console.log('Центроид контура (viewBox):', { cx: +cx.toFixed(6), cy: +cy.toFixed(6) })
  console.log('Центр bbox контура (viewBox):', { midX: +box.midX.toFixed(6), midY: +box.midY.toFixed(6) })
  console.log('')
  console.log('Смещение центроида от центра viewBox → px на иконке:', {
    x: +opticalCentroidX.toFixed(4),
    y: +opticalCentroidY.toFixed(4),
  })
  console.log('Смещение центра bbox от центра viewBox → px:', {
    x: +opticalBboxX.toFixed(4),
    y: +opticalBboxY.toFixed(4),
  })
  console.log('')
  console.log('--- Вставка в src/index.css (.opponent-exact-order-star-with-flash) ---')
  console.log('/* из tools/exact-order-star-flash-offset.mjs: гибрид bbox-X + centroid-Y */')
  console.log(`--exact-order-star-flash-optical-x: ${opticalHybridX.toFixed(3)}px;`)
  console.log(`--exact-order-star-flash-optical-y: ${opticalHybridY.toFixed(3)}px;`)
  console.log('')
  console.log('Альтернатива (оба по центроиду):')
  console.log(`--exact-order-star-flash-optical-x: ${opticalCentroidX.toFixed(3)}px;`)
  console.log(`--exact-order-star-flash-optical-y: ${opticalCentroidY.toFixed(3)}px;`)
}

main()
