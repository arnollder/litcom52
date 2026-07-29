#!/usr/bin/env node

import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { handleApiRequest, pathOnly, sendJson } from './lib/http-api.mjs'
import { loadEnvFromFile } from './lib/moysklad-env.mjs'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '..')
const DIST_DIR = resolve(ROOT_DIR, 'dist')
const HOST = process.env.HOST || '127.0.0.1'
const PORT = Number(process.env.PORT || 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function safeDistPath(pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '')
  const full = normalize(join(DIST_DIR, relative))
  if (!full.startsWith(DIST_DIR + sep) && full !== DIST_DIR) return null
  return full
}

async function sendFile(res, filePath) {
  const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream'
  res.statusCode = 200
  res.setHeader('Content-Type', type)
  if (extname(filePath) === '.html') {
    res.setHeader('Cache-Control', 'no-cache')
  } else {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }
  createReadStream(filePath).pipe(res)
}

async function handleStatic(req, res, pathname) {
  const candidate = safeDistPath(pathname)
  if (candidate) {
    try {
      const info = await stat(candidate)
      if (info.isFile()) {
        await sendFile(res, candidate)
        return
      }
    } catch {
      // fall through to SPA
    }
  }

  const indexPath = join(DIST_DIR, 'index.html')
  try {
    await stat(indexPath)
    await sendFile(res, indexPath)
  } catch {
    sendJson(res, 500, { error: 'dist/index.html not found. Run npm run build first.' })
  }
}

const server = createServer(async (req, res) => {
  const pathname = pathOnly(req.url || '/')

  try {
    if (await handleApiRequest(req, res)) return
    if (pathname === '/healthz') {
      sendJson(res, 200, { ok: true })
      return
    }
    await handleStatic(req, res, pathname)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    sendJson(res, 500, { ok: false, error: message })
  }
})

await loadEnvFromFile()
server.listen(PORT, HOST, () => {
  console.log(`litcom52 listening on http://${HOST}:${PORT}`)
})
