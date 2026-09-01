import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const ALLOWED_SFX = new Set([
  'card_play',
  'trick_won',
  'bid_place',
  'exact_south',
  'exact_other',
  'over_south',
  'over_other',
  'under_south',
  'under_other',
  'illegal',
  'your_turn_soft',
  'your_turn_nudge_long',
  'your_turn_nudge_short',
  'deal_complete',
  'deal_complete_south',
  'deal_results_fly',
  'ui_tap',
  'game_win',
  'game_lose',
])

const ALLOWED_MUSIC = new Set(['menu_bed', 'table_bed'])

const MAX_BYTES_SFX = 3 * 1024 * 1024
const MAX_BYTES_MUSIC = 8 * 1024 * 1024
const ROUTE_SFX = '/__updown_lab_sfx'
const ROUTE_MUSIC = '/__updown_lab_music'

function readRaw(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer | string) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c)
      total += buf.length
      if (total > maxBytes) {
        reject(new Error('too large'))
        req.destroy()
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, code: number, body: string): void {
  res.statusCode = code
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(body)
}

function idFromReq(req: IncomingMessage): string {
  const url = req.url ?? ''
  try {
    return new URL(url, 'http://lab.local').searchParams.get('id') ?? ''
  } catch {
    return ''
  }
}

function makeWriter(opts: {
  allowed: Set<string>
  maxBytes: number
  subdir: 'sfx' | 'music'
}): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method === 'OPTIONS') {
      send(res, 204, '')
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, 'POST only')
      return
    }
    const q = idFromReq(req)
    if (!opts.allowed.has(q)) {
      send(res, 400, `bad id:${q}`)
      return
    }
    void (async () => {
      try {
        const raw = await readRaw(req, opts.maxBytes)
        if (raw.length < 44 || raw.subarray(0, 4).toString('ascii') !== 'RIFF') {
          send(res, 400, 'not wav')
          return
        }
        const root = (req as IncomingMessage & { __viteRoot?: string }).__viteRoot
        const destRoot = root ?? process.cwd()
        const dest = path.resolve(destRoot, 'public', 'audio', opts.subdir, `${q}.wav`)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, raw)
        send(res, 200, 'ok')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'write failed'
        send(res, 500, msg)
      }
    })()
  }
}

/**
 * Лаб: POST /__updown_lab_sfx?id=… и /__updown_lab_music?id=menu_bed|table_bed
 * пишет WAV в public/audio/{sfx|music}/
 */
export function labSfxWritePlugin(): Plugin {
  return {
    name: 'lab-sfx-write',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      const sfx = makeWriter({ allowed: ALLOWED_SFX, maxBytes: MAX_BYTES_SFX, subdir: 'sfx' })
      const music = makeWriter({ allowed: ALLOWED_MUSIC, maxBytes: MAX_BYTES_MUSIC, subdir: 'music' })

      server.middlewares.use(ROUTE_SFX, (req, res, _next) => {
        ;(req as IncomingMessage & { __viteRoot?: string }).__viteRoot = server.config.root
        sfx(req, res)
      })
      server.middlewares.use(ROUTE_MUSIC, (req, res, _next) => {
        ;(req as IncomingMessage & { __viteRoot?: string }).__viteRoot = server.config.root
        music(req, res)
      })
    },
  }
}
