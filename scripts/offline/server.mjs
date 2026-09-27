import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const types = { '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.sha256': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// Only built application files are served. There is no FBX endpoint or upload API.
export async function createViewerServer(directory) {
  const root = await realpath(directory)
  await stat(resolve(root, 'index.html'))
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Security-Policy', policy)
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Cache-Control', 'no-store')
    const address = server.address()
    const host = `127.0.0.1:${address.port}`
    if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== `http://${host}`)) {
      response.writeHead(403).end('Forbidden')
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD')
      response.writeHead(405).end('Method not allowed')
      return
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname)
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1)
      const file = await realpath(resolve(root, relative))
      if (!file.startsWith(root + sep) || !types[extname(file)] || !(await stat(file)).isFile()) {
        response.writeHead(404).end('Not found')
        return
      }
      const content = await readFile(file)
      response.setHeader('Content-Type', types[extname(file)])
      response.setHeader('Content-Length', content.byteLength)
      response.writeHead(200).end(request.method === 'HEAD' ? undefined : content)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })
  return server
}

function openBrowser(url) {
  // The URL is constructed from a bound numeric loopback port, never user input.
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open'
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  const child = spawn(command, args, { stdio: 'ignore' })
  child.on('error', () => console.log('Open the URL above in Chrome.'))
  child.on('exit', (code) => { if (code) console.log('Open the URL above in Chrome.') })
}

async function main() {
  const args = process.argv.slice(2)
  const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
  const root = value('--root', fileURLToPath(new URL('./dist/', import.meta.url)))
  const port = Number(value('--port', '0'))
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.')
  const server = await createViewerServer(root)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const url = `http://127.0.0.1:${server.address().port}/`
  console.log(`\nFBX Motion Viewer — offline\n\n${url}\n\nKeep this window open while using the viewer.\nPress Ctrl+C to stop. No internet connection is required.\n`)
  if (!args.includes('--no-browser')) openBrowser(url)
  const stop = () => { server.closeAllConnections(); server.close(() => process.exit(0)) }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`Could not start the viewer: ${error.message}`); process.exitCode = 1 })
}
