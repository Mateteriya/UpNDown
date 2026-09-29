import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

/**
 * HMR огромного src/index.css (~3MB) иногда отдаёт пустой/урезанный `__vite__css`,
 * из‑за чего главная теряет стили (огромные касты, слетевшие кнопки).
 *
 * Пушить 3MB CSS через HMR websocket нельзя — только full-reload.
 */
const INDEX_CSS_RE = /[\\/]src[\\/]index\.css(?:\?|$)/i
const MIN_SOURCE_BYTES = 80_000
const EMPTY_CSS_RE = /const\s+__vite__css\s*=\s*(?:""|'')\s*/m
const MISSING_CSS_RE = /const\s+__vite__css\s*=\s*(?:void 0|undefined)\s*/m

function isIndexCssId(id: string): boolean {
  const bare = id.split('?')[0] ?? id
  const norm = bare.replace(/\\/g, '/')
  return INDEX_CSS_RE.test(bare.replace(/\//g, path.sep)) || norm.endsWith('/src/index.css')
}

function sourcePath(id: string): string {
  return (id.split('?')[0] ?? id).replace(/\0/g, '')
}

export function safeLargeCssPlugin(): Plugin {
  let server: ViteDevServer | undefined
  let lastReloadAt = 0

  const requestFullReload = (reason: string, file: string) => {
    const now = Date.now()
    if (now - lastReloadAt < 2500) return
    lastReloadAt = now
    console.error(`[safe-large-css] ${reason} — full-reload`)
    server?.ws.send({ type: 'full-reload', path: file })
  }

  return {
    name: 'safe-large-css',
    enforce: 'post',
    configureServer(s) {
      server = s

      /* ?direct stylesheet: всегда отдать полный index.css с диска. */
      s.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.includes('/src/index.css')) return next()
        if (!url.includes('?direct') && !url.includes('&direct')) return next()

        const file = path.resolve(s.config.root, 'src/index.css')
        try {
          const raw = fs.readFileSync(file)
          if (raw.length < MIN_SOURCE_BYTES) return next()
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/css; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Content-Length', String(raw.length))
          res.end(raw)
        } catch {
          next()
        }
      })
    },
    transform(code, id) {
      if (!isIndexCssId(id)) return
      if (id.includes('?direct')) return

      let srcBytes = 0
      const file = sourcePath(id)
      try {
        srcBytes = fs.statSync(file).size
      } catch {
        return
      }
      if (srcBytes < MIN_SOURCE_BYTES) return

      const empty = EMPTY_CSS_RE.test(code) || MISSING_CSS_RE.test(code)
      const lit = code.match(/const\s+__vite__css\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/)
      const litLen = lit?.[1]?.length ?? 0
      const suspiciouslySmall = lit != null && litLen < Math.min(50_000, srcBytes * 0.05)

      if (!empty && !suspiciouslySmall) return

      /* Не инжектим 3MB в JS — только full-reload. */
      requestFullReload(
        `empty/truncated index.css inject (source ${srcBytes}B, literal ${litLen}B)`,
        file,
      )
      return
    },
    handleHotUpdate(ctx) {
      if (!isIndexCssId(ctx.file)) return
      requestFullReload('index.css changed', ctx.file)
      /* Блокируем обычный CSS HMR для этого файла */
      return []
    },
  }
}
