import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const ALLOWED = new Set([
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
const MAX_BYTES = 3 * 1024 * 1024
const ROUTE = '/__updown_lab_sfx'

function readRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (c: Buffer | string) => {
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c)
      total += buf.length
      if (total > MAX_BYTES) {
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

/**
 * Лаб SFX: POST /__updown_lab_sfx?id=trick_won  body=WAV
 * пишет public/audio/sfx/{id}.wav — звук сразу в игре, без папки Загрузки.
 */
export function labSfxWritePlugin(): Plugin {
  return {
    name: 'lab-sfx-write',
    enforce: 'pre',
    apply: 'serve',
    configureServer(server) {
      const handler = (req: IncomingMessage, res: ServerResponse, _next: (err?: unknown) => void) => {
        if (req.method === 'OPTIONS') {
          send(res, 204, '')
          return
        }
        if (req.method !== 'POST') {
          send(res, 405, 'POST only')
          return
        }
        const q = idFromReq(req)
        if (!ALLOWED.has(q)) {
          send(res, 400, `bad id:${q}`)
          return
        }
        void (async () => {
          try {
            const raw = await readRaw(req)
            if (raw.length < 44 || raw.subarray(0, 4).toString('ascii') !== 'RIFF') {
              send(res, 400, 'not wav')
              return
            }
            const dest = path.resolve(server.config.root, 'public', 'audio', 'sfx', `${q}.wav`)
            fs.mkdirSync(path.dirname(dest), { recursive: true })
            fs.writeFileSync(dest, raw)
            send(res, 200, 'ok')
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'write failed'
            send(res, 500, msg)
          }
        })()
      }

      server.middlewares.use(ROUTE, handler)
    },
  }
}
