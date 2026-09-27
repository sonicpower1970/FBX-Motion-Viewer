import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createViewerServer } from '../../scripts/offline/server.mjs'

let server
let origin
before(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fbx-viewer-server-'))
  const root = join(directory, 'dist')
  await mkdir(root)
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Viewer</title>')
  await writeFile(join(root, 'reader.wasm'), new Uint8Array([0,97,115,109,1,0,0,0]))
  await writeFile(join(root, 'app.js'), 'export const value = 1')
  await writeFile(join(directory, 'secret.html'), 'private')
  await symlink(join(directory, 'secret.html'), join(root, 'linked.html'))
  server = await createViewerServer(root)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
})

test('serves built files on loopback with restrictive production headers', async () => {
  assert.equal(server.address().address, '127.0.0.1')
  const response = await fetch(origin)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/html/)
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/)
  assert.match(await response.text(), /Viewer/)
  const script = await fetch(`${origin}/app.js`)
  assert.match(script.headers.get('content-type'), /javascript/)
  assert.match(response.headers.get('content-security-policy'), /script-src 'self' 'wasm-unsafe-eval'/)
  const wasm = await fetch(`${origin}/reader.wasm`)
  assert.equal(wasm.headers.get('content-type'), 'application/wasm')
  assert.equal((await wasm.arrayBuffer()).byteLength, 8)
  const head = await fetch(origin, { method: 'HEAD' })
  assert.equal(await head.text(), '')
  assert.ok(Number(head.headers.get('content-length')) > 0)
})

test('has no upload endpoint and refuses cross-origin requests', async () => {
  assert.equal((await fetch(origin, { method: 'POST', body: 'FBX data' })).status, 405)
  assert.equal((await fetch(origin, { headers: { Origin: 'https://example.com' } })).status, 403)
  // Custom Host requests also guard against DNS rebinding to this local server.
  const { request } = await import('node:http')
  const status = await new Promise((resolve, reject) => {
    const req = request(origin, { headers: { Host: 'example.com' } }, (response) => { response.resume(); resolve(response.statusCode) })
    req.on('error', reject)
    req.end()
  })
  assert.equal(status, 403)
})

test('does not expose adjacent files, symlinks, directory listings or unknown paths', async () => {
  for (const path of ['/..%2Fsecret.html', '/linked.html', '/runtime/node', '/assets/', '/missing.html', '/%00']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 404, path)
    assert.doesNotMatch(await response.text(), /private/)
  }
})
