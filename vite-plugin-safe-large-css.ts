import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * HMR огромного src/index.css (~2MB+) иногда отдаёт `const __vite__css = ""`,
 * из‑за чего страница теряет все стили.
 *
 * Важно для dev-цикла за столом:
 * - НЕ форсируем full-reload на каждую правку CSS (это сбрасывало партию в браузере).
 * - Обычный CSS HMR остаётся; при пустом/урезанном inject подставляем файл с диска.
 * - full-reload — только если inject всё равно пустой после восстановления (редко).
 */
const INDEX_CSS_RE = /[\\/]src[\\/]index\.css(?:\?|$)/i
const MIN_SOURCE_BYTES = 80_000
const EMPTY_CSS_RE = /const\s+__vite__css\s*=\s*(?:""|'')\s*/m

function isIndexCssId(id: string): boolean {
  const bare = id.split('?')[0] ?? id
  return INDEX_CSS_RE.test(bare.replace(/\//g, path.sep)) || bare.replace(/\\/g, '/').endsWith('/src/index.css')
}

function sourcePath(id: string): string {
  return (id.split('?')[0] ?? id).replace(/\0/, '')
}

export function safeLargeCssPlugin(): Plugin {
  let server: ViteDevServer | undefined
  let lastReloadAt = 0

  return {
    name: 'safe-large-css',
    enforce: 'post',
    configureServer(s) {
      server = s
    },
    transform(code, id) {
      if (!isIndexCssId(id)) return
      if (id.includes('?direct')) return

      let srcBytes = 0
      try {
        srcBytes = fs.statSync(sourcePath(id)).size
      } catch {
        return
      }
      if (srcBytes < MIN_SOURCE_BYTES) return

      const empty = EMPTY_CSS_RE.test(code)
      const lit = code.match(/const\s+__vite__css\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/)
      const litLen = lit?.[1]?.length ?? 0
      const suspiciouslySmall = lit != null && litLen < Math.min(10_000, srcBytes * 0.05)

      if (!empty && !suspiciouslySmall) return

      const raw = fs.readFileSync(sourcePath(id), 'utf8')
      console.warn(
        `[safe-large-css] Recovered empty/truncated index.css inject (source ${srcBytes}B, literal ${litLen}B) — CSS HMR kept, no game reset.`,
      )

      let next = code
      if (empty) {
        next = code.replace(EMPTY_CSS_RE, `const __vite__css = ${JSON.stringify(raw)}\n`)
      } else if (lit) {
        next = code.replace(lit[0], `const __vite__css = ${JSON.stringify(raw)}`)
      }

      // Если после подстановки всё ещё пусто — один осторожный reload (не чаще раза в 5 с).
      if (EMPTY_CSS_RE.test(next) || !next.includes('__vite__css')) {
        const now = Date.now()
        if (now - lastReloadAt > 5000) {
          lastReloadAt = now
          console.error('[safe-large-css] Inject still empty after recovery — full-reload once')
          server?.ws.send({ type: 'full-reload', path: sourcePath(id) })
        }
      }

      return {
        code: next,
        map: null,
      }
    },
  }
}
