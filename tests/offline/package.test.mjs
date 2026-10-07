import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, stat } from 'node:fs/promises'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { makeFbx } from '../fixtures/fbx.ts'

test('extracted Mac package runs with bundled Node and no network dependencies', { timeout: 45000 }, async (context) => {
  if (process.platform !== 'darwin') { context.skip('macOS launcher smoke test'); return }
  const label = process.arch === 'arm64' ? 'macos-apple-silicon' : 'macos-intel'
  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  const name = `FBX-Motion-Viewer-v${version}-${label}`
  const zip = join(process.cwd(), 'releases', `${name}.zip`)
  await stat(zip)
  const temporary = await mkdtemp(join(tmpdir(), 'FBX Viewer offline test '))
  execFileSync('unzip', ['-q', zip, '-d', temporary])
  const bundle = join(temporary, name)
  assert.ok((await stat(join(bundle, 'Start Viewer.command'))).mode & 0o111)
  const launcherContents = join(bundle, 'FBX Motion Viewer.app', 'Contents')
  assert.ok((await stat(join(launcherContents, 'MacOS', 'FBXMotionViewer'))).mode & 0o111)
  execFileSync('/usr/bin/plutil', ['-lint', join(launcherContents, 'Info.plist')])
  execFileSync('/bin/sh', ['-n', join(launcherContents, 'MacOS', 'FBXMotionViewer')])
  assert.ok(!(await readdir(bundle)).includes('node_modules'))
  assert.match(await readFile(join(bundle, 'third-party-sources', 'mediabunny', 'LICENSE'), 'utf8'), /Mozilla Public License/)
  assert.ok((await stat(join(bundle, 'third-party-sources', 'mediabunny', 'src', 'index.ts'))).isFile())
  const runtime = join(bundle, 'runtime', 'node')
  await chmod(runtime, 0o755)
  assert.match(execFileSync(runtime, ['--version'], { encoding: 'utf8' }), /^v24\./)
  // No global Node/npm on PATH and a working directory outside the extracted ZIP.
  const child = spawn('/bin/sh', [join(bundle, 'Start Viewer.command'), '--no-browser'], {
    cwd: tmpdir(), env: { ...process.env, PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let browser
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Offline server did not start')), 10000)
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      let output = ''
      child.stdout.on('data', (chunk) => {
        output += chunk
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//)
        if (match) { clearTimeout(timer); resolve(match[0]) }
      })
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited early: ${code}`)) })
    })
    browser = await chromium.launch({ channel: 'chrome' })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const externalRequests = []
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) => {
      if (!route.request().url().startsWith(url) && !route.request().url().startsWith(`blob:${url}`)) {
        externalRequests.push(route.request().url())
        return route.abort()
      }
      return route.continue()
    })
    await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
    await page.goto(url)
    await page.getByRole('heading', { name: 'Bring your motion into view.' }).waitFor()
    await page.getByLabel('Open FBX file').setInputFiles({ name: 'offline.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx({ mesh: true })) })
    await page.getByText('1 meshes · 3 bones · 2 takes').waitFor()
    await page.getByRole('button', { name: 'Next frame', exact: true }).click()
    assert.equal(await page.getByLabel('Current frame').inputValue(), '1')
    await page.getByLabel('Open FBX file').setInputFiles(join(process.cwd(), 'tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx'))
    await page.getByText('1 meshes · 4 bones · 3 takes').waitFor()
    await page.getByLabel('Timeline scrub').fill('9')
    await page.getByRole('button', { name: 'Follow', exact: true }).click()
    await page.getByRole('button', { name: 'Shadow', exact: true }).click()
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'EXPORT MP4' }).click()
    await page.getByText('Export complete', { exact: true }).waitFor({ timeout: 20000 })
    assert.equal(await page.getByLabel('Current frame').inputValue(), '9')
    assert.equal(await page.getByRole('button', { name: 'Follow', exact: true }).getAttribute('aria-pressed'), 'true')
    const downloaded = await downloadEvent
    assert.ok((await stat(await downloaded.path())).size > 1000)
    if (process.env.FBX_LEGACY_SAMPLE) {
      await page.getByLabel('Open FBX file').setInputFiles(process.env.FBX_LEGACY_SAMPLE)
      await page.getByText('0 meshes · 25 bones · 1 takes').waitFor()
      assert.equal(await page.getByTestId('end-frame').textContent(), '932')
    }
    await page.getByRole('button', { name: 'Light viewport background', exact: true }).click()
    await page.getByRole('button', { name: '16:9 Frame Guide', exact: true }).click()
    await page.getByRole('button', { name: 'BURN-IN', exact: true }).click()
    const pngEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'CAPTURE', exact: true }).click()
    await page.getByText('Capture complete', { exact: true }).waitFor()
    const pngDownload = await pngEvent
    assert.match(pngDownload.suggestedFilename(), /_f[0-9]+\.png$/)
    const pngBytes = await readFile(await pngDownload.path())
    assert.equal(pngBytes.subarray(1, 4).toString(), 'PNG')
    assert.equal(pngBytes.readUInt32BE(16), 1920)
    assert.equal(pngBytes.readUInt32BE(20), 1080)
    const frameBeforeBatch = await page.getByLabel('Current frame').inputValue()
    // Use real browser file handles/streams in private origin storage. Only the
    // native directory-selection dialog is substituted; MP4 writes are real.
    await page.evaluate(() => Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle('batch-smoke', { create: true }),
    }))
    await page.getByRole('button', { name: 'BATCH EXPORT', exact: true }).click()
    await page.getByLabel('Batch input files').setInputFiles({ name: 'batch.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx({ mesh: true })) })
    await page.getByRole('button', { name: 'SELECT FOLDER', exact: true }).click()
    await page.getByLabel('Batch resolution').selectOption('720p')
    await page.getByRole('button', { name: 'START BATCH', exact: true }).click()
    await page.getByRole('cell', { name: 'Done', exact: true }).waitFor({ timeout: 20000 })
    const batchBytes = await page.evaluate(async () => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('batch-smoke')
      return (await (await directory.getFileHandle('batch.mp4')).getFile()).size
    })
    assert.ok(batchBytes > 1000)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    assert.equal(await page.getByLabel('Current frame').inputValue(), frameBeforeBatch)
    await mkdir('test-results', { recursive: true })
    await page.screenshot({ path: 'test-results/offline-package.png' })
    assert.deepEqual(externalRequests, [])
    assert.deepEqual(errors, [])
  } finally {
    if (browser) await browser.close()
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill('SIGTERM'); await stopped }
  }
})
