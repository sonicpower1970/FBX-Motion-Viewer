import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { makeFbx } from '../fixtures/fbx'

test('burn-in preview and real offline exports share frame text/layout at every resolution', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('/')
  const result = await page.evaluate(async source => {
    const enginePath = '/src/viewer/ViewerEngine.ts', overlayPath = '/src/overlay/BurnInRenderer.ts'
    const { ViewerEngine } = await import(/* @vite-ignore */ enginePath)
    const { BurnInRenderer, frameCounter } = await import(/* @vite-ignore */ overlayPath)
    let bytes = 0
    let movie = new Blob()
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({ createWritable: async () => ({ write: async (blob: Blob) => { bytes += blob.size; movie = blob }, close: async () => {}, abort: async () => {} }) }) })
    const div = document.createElement('div'); div.style.cssText = 'position:fixed;inset:0;width:640px;height:360px'; document.body.append(div)
    const v = new ViewerEngine(div, () => {})
    const records: { text: string; width: number; height: number; settings: object }[] = []
    const original = BurnInRenderer.prototype.draw
    BurnInRenderer.prototype.draw = function(w: number, h: number, settings: object, data: object, scene?: HTMLCanvasElement) {
      original.call(this, w, h, settings, data, scene)
      if (scene) records.push({ text: frameCounter(data), width: w, height: h, settings: { ...settings } })
    }
    try {
      await v.load(new File([source], 'very_long_character_'.repeat(30) + '_v023.fbx'))
      v.renderer.setAnimationLoop(null); v.setFollow(true); v.seekFrame(15)
      const statuses = [], counts = [], images = []
      for (const enabled of [false, true]) {
        v.setBurnIn(enabled)
        images.push(v.burnIn.canvas.toDataURL())
        for (const resolution of ['720p', '1080p', 'viewport']) {
          const start = records.length
          await v.exportMovie(resolution)
          statuses.push(v.state.exportStatus); counts.push(records.length - start)
          if (v.asset.playback.time !== .5 || !v.state.follow) throw new Error('Viewer state was not restored')
        }
      }
      v.asset.playback.seek(v.asset.playback.duration)
      v.drawBurnIn()
      const end = frameCounter(v.burnInData())
      v.asset.playback.playing = true
      v.updatePose(v.asset.playback.advance(.01)); v.drawBurnIn()
      const loop = frameCounter(v.burnInData())
      const libraryPath = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/mediabunny\.js(?:\?|$)/.test(name))!
      if (!libraryPath) throw new Error('Encoder module URL was not found')
      const { Input, BlobSource, MP4, VideoSampleSink } = await import(/* @vite-ignore */ libraryPath)
      const input = new Input({ formats: [MP4], source: new BlobSource(movie) })
      let decodedImage = ''
      try {
        const track = await input.getPrimaryVideoTrack()
        const sample = await new VideoSampleSink(track).getSample(1)
        if (!sample) throw new Error('MP4 decode failed')
        try {
          const decoded = document.createElement('canvas'); decoded.width = track.displayWidth; decoded.height = track.displayHeight
          sample.draw(decoded.getContext('2d'), 0, 0)
          decodedImage = decoded.toDataURL('image/png')
        } finally { sample.close() }
      } finally { input.dispose() }
      return { decodedImage, statuses, counts, records, bytes, distinctImages: new Set(images).size, end, loop }
    } finally { BurnInRenderer.prototype.draw = original; v.dispose(); div.remove() }
  }, makeFbx({ mesh: true }))
  await writeFile('test-results/burn-in-decoded.png', Buffer.from(result.decodedImage.split(',')[1], 'base64'))
  expect(result.statuses).toEqual(Array(6).fill('Export complete'))
  expect(result.counts).toEqual([0, 0, 0, ...Array(3).fill(61)])
  expect(result.distinctImages).toBe(2)
  expect(result.records.every(record => JSON.stringify(record.settings) === JSON.stringify({ filename: true, frame: true }))).toBe(true)
  expect(result.bytes).toBeGreaterThan(10000)
  for (let i = 0; i < result.records.length; i += 61) {
    expect(result.records[i].text).toBe('0000 / 0060')
    expect(result.records[i + 30].text).toBe('0030 / 0060')
    expect(result.records[i + 60].text).toBe('0060 / 0060')
  }
  expect(result.records.slice(0, 183).filter((_, i) => i % 61 === 0).map(r => [r.width, r.height])).toEqual([[1280,720],[1920,1080],[640,360]])
  expect(result.end).toBe('0060 / 0060'); expect(result.loop).toBe('0000 / 0060')
})

test('single burn-in toggle preserves labels; frame guide icon toggles independently', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'character_walk_v023.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx({ mesh: true })) })
  const burn = page.getByRole('button', { name: 'BURN-IN', exact: true })
  await expect(burn).toHaveAttribute('aria-pressed', 'false')
  await burn.click()
  await expect(burn).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Timeline scrub').fill('30')
  const guide = page.getByRole('button', { name: '16:9 Frame Guide', exact: true })
  await expect(guide).toHaveAttribute('title', '16:9 Frame Guide')
  await expect(guide).toHaveAttribute('aria-pressed', 'false')
  await guide.click()
  await expect(guide).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('frame-guide')).toBeVisible()
  await expect(page.getByText('character_walk_v023.fbx', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Current frame')).toHaveValue('30')
  await expect(page.locator('.burn-in-canvas')).toBeVisible()
  expect(await page.locator('.burn-in-canvas').evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none')
  await page.screenshot({ path: 'test-results/burn-in-review.png' })
  await burn.click()
  await expect(burn).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.burn-in-canvas')).toHaveCount(0)
  await expect(page.getByTestId('frame-guide')).toBeVisible()
  await guide.click()
  await expect(guide).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('frame-guide')).toHaveCount(0)
})
