#!/usr/bin/env node
/* =====================================================================
   Tiny static server for local preview.

   Browsers refuse fetch() requests against file:// URLs, so this lab
   folder has to be served over HTTP. GitHub Pages does that for you in
   production; this script does it on your machine.

   Usage:  node serve.mjs [port]
           npm run serve
   ===================================================================== */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)))
const PORT = Number(process.argv[2] || process.env.PORT || 5173)
const HOST = process.env.HOST || '127.0.0.1'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'text/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
}

function resolveTarget(urlPath) {
  let pathname = decodeURIComponent(urlPath.split('?')[0].split('#')[0])
  if (pathname.endsWith('/')) pathname += 'index.html'
  const target = normalize(join(ROOT, pathname))
  // Never serve anything outside the project folder.
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null
  return target
}

const server = createServer(async (req, res) => {
  try {
    const target = resolveTarget(req.url || '/')
    if (!target) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('403 Forbidden')
      return
    }

    const info = await stat(target).catch(() => null)
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('404 Not Found: ' + req.url)
      return
    }

    const body = await readFile(target)
    res.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    })
    res.end(body)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('500 ' + err.message)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Lab preview running at http://${HOST}:${PORT}/`)
  console.log('Pages: /  /books.html  /users.html   (Ctrl+C to stop)')
})
