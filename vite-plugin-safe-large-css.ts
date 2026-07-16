import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * HMR огромного src/index.css (~2MB) иногда отдаёт `const __vite__css = ""`,
 * из‑за чего страница теряет все стили (остаётся «сырой» каст).
 *
 * - правки index.css → full-reload вместо CSS HMR
 * - если transform всё же пустой при большом файле — подставляем CSS с диска
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

  return {
    name: 'safe-large-css',
    enforce: 'post',
    configureServer(s) {
      server = s
    },
    handleHotUpdate(ctx) {
      if (!isIndexCssId(ctx.file) && !ctx.file.replace(/\\/g, '/').endsWith('/src/index.css')) {
        return
      }
      // Не пушим пустой CSS-модуль — только полная перезагрузка страницы
      ctx.server.ws.send({ type: 'full-reload', path: ctx.file })
      return []
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
      console.error(
        `[safe-large-css] Recovered empty/truncated index.css inject (source ${srcBytes}B, literal ${litLen}B). Prefer full-reload.`,
      )
      server?.ws.send({ type: 'full-reload', path: sourcePath(id) })

      if (empty) {
        return {
          code: code.replace(EMPTY_CSS_RE, `const __vite__css = ${JSON.stringify(raw)}\n`),
          map: null,
        }
      }
      if (lit) {
        return {
          code: code.replace(lit[0], `const __vite__css = ${JSON.stringify(raw)}`),
          map: null,
        }
      }
    },
  }
}
