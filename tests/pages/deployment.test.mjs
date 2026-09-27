import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { unzipSync } from 'fflate'
import { createViewerServer } from '../../scripts/offline/server.mjs'
import { makeFbx } from '../fixtures/fbx.ts'

test('Pages nested path loads legacy WASM, exports MP4 and exposes matching source', { timeout: 60000 }, async () => {
  const prefix = '/review/arbitrary-project/'
  const server = await createViewerServer(resolve('dist-pages'))
  const handler = server.listeners('request')[0]
  server.removeAllListeners('request')
  server.on('request', (request, response) => {
    if (!request.url.startsWith(prefix)) { response.writeHead(404).end(); return }
    request.url = request.url.slice(prefix.length - 1)
    handler(request, response)
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  let browser
  try {
    const base = `http://127.0.0.1:${server.address().port}${prefix}`
    browser = await chromium.launch({ channel: 'chrome' })
    const page = await browser.newPage()
    const requests = [], errors = [], failures = []
    page.on('request', request => requests.push(request.url()))
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => { if (response.status() >= 400) failures.push(response.url()) })
    await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('blob:') ? route.continue() : route.abort())
    await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
    await page.goto(base)
    await page.getByRole('heading', { name: 'Bring your motion into view.' }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Licenses', exact: true }).getAttribute('href'), './legal/index.html')
    await page.getByLabel('Open FBX file').setInputFiles(resolve('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx'))
    await page.getByText('1 meshes · 4 bones · 3 takes').waitFor()
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'EXPORT MP4' }).click()
    await page.getByText('Export complete', { exact: true }).waitFor({ timeout: 25000 })
    assert.ok((await stat(await (await downloaded).path())).size > 1000)
    await page.evaluate(() => Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle('pages-batch', { create: true }) }))
    await page.getByRole('button', { name: 'BATCH EXPORT', exact: true }).click()
    await page.getByLabel('Batch input files').setInputFiles({ name: 'pages-motion.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx({ mesh: true })) })
    await page.getByRole('button', { name: 'SELECT FOLDER', exact: true }).click()
    await page.getByLabel('Batch resolution').selectOption('720p')
    await page.getByRole('button', { name: 'START BATCH', exact: true }).click()
    await page.getByRole('cell', { name: 'Done', exact: true }).waitFor({ timeout: 25000 })
    const bytes = await page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('pages-batch')
      return (await (await dir.getFileHandle('pages-motion.mp4')).getFile()).size
    })
    assert.ok(bytes > 1000)
    const legal = await page.request.get(`${base}legal/index.html`)
    assert.equal(legal.status(), 200)
    assert.match(await legal.text(), /Mediabunny 1\.59\.1/)
    const license = await page.request.get(`${base}legal/mediabunny-LICENSE.txt`)
    assert.match(await license.text(), /Mozilla Public License/)
    const archive = await page.request.get(`${base}legal/mediabunny-1.59.1-source.zip`)
    assert.equal(archive.status(), 200)
    const entries = unzipSync(new Uint8Array(await archive.body()))
    let sourceCount = 0
    for (const [name, content] of Object.entries(entries)) {
      const local = name.replace('mediabunny-1.59.1/', 'node_modules/mediabunny/')
      assert.deepEqual(Buffer.from(content), await readFile(local), name)
      if (name.includes('/src/')) sourceCount++
    }
    assert.ok(sourceCount >= 60)
    assert.ok(requests.some(url => /legacy\.worker.*\.js/.test(url)))
    assert.ok(requests.some(url => /ufbx.*\.wasm/.test(url)))
    assert.deepEqual(failures, [])
    assert.deepEqual(errors, [])
    assert.ok(requests.every(url => url.startsWith(base) || url.startsWith('blob:')))
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
