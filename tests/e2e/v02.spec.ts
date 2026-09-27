import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { BufferSource, EncodedPacketSink, Input, MP4 } from 'mediabunny'
import { makeFbx } from '../fixtures/fbx'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
})

test('v0.2 controls and actual MP4 export retain timeline/Follow state', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (/GL_INVALID|THREE.WebGLProgram/.test(e.text())) errors.push(e.text()) })
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'preview.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx({ mesh: true })) })
  await expect(page.getByText('1 meshes · 3 bones · 2 takes')).toBeVisible()
  await page.getByLabel('Playback speed').selectOption('2')
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await page.getByLabel('Timeline scrub').fill('15')
  await page.getByRole('button', { name: 'Next frame', exact: true }).click()
  await expect(page.getByLabel('Current frame')).toHaveValue('16')
  await page.getByRole('button', { name: 'Previous frame', exact: true }).click()
  await page.getByRole('button', { name: 'Bones', exact: true }).click()
  const hidden = await page.locator('canvas').screenshot()
  await page.getByRole('button', { name: 'X-Ray', exact: true }).click()
  expect((await page.locator('canvas').screenshot()).equals(hidden)).toBe(true)
  await page.getByRole('button', { name: 'Bones', exact: true }).click()
  const unshadowed = await page.locator('canvas').screenshot()
  await page.getByRole('button', { name: 'Shadow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Shadow', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect((await page.locator('canvas').screenshot()).equals(unshadowed)).toBe(false)
  await page.screenshot({ path: 'test-results/v02-review.png' })
  const downloading = page.waitForEvent('download', { timeout: 150000 })
  await page.getByRole('button', { name: 'EXPORT MP4' }).click()
  await expect(page.getByText('Export complete', { exact: true })).toBeVisible({ timeout: 150000 })
  await expect(page.getByLabel('Current frame')).toHaveValue('15')
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Playback speed')).toHaveValue('2')
  const download = await downloading
  await download.saveAs('test-results/v02-preview.mp4')
  const input = new Input({ formats: [MP4], source: new BufferSource(await readFile((await download.path())!)) })
  try {
    const track = (await input.getPrimaryVideoTrack())!
    expect(track.displayWidth).toBe(1280); expect(track.displayHeight).toBe(720)
    expect(await input.getAudioTracks()).toHaveLength(0)
    const packets = []
    for await (const packet of new EncodedPacketSink(track).packets()) packets.push(packet)
    expect(packets).toHaveLength(61)
    const times = packets.map(packet => packet.timestamp).sort((a, b) => a - b)
    for (let i = 0; i < times.length; i++) expect(times[i]).toBeCloseTo(i / 30, 5)
    expect(await track.computeDuration()).toBeCloseTo(61 / 30, 5)
  } finally { input.dispose() }
  expect(errors).toEqual([])
})

test('export restores precise camera, target, playback and follow on success/cancel/failure', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/')
  const result = await page.evaluate(async source => {
    const path = '/src/viewer/ViewerEngine.ts'
    const { ViewerEngine } = await import(/* @vite-ignore */ path)
    const div = document.createElement('div')
    div.style.cssText = 'width:322px;height:242px;position:fixed;left:0;top:0'
    document.body.append(div)
    const viewer = new ViewerEngine(div, () => {})
    try {
      await viewer.load(new File([source], 'state.fbx'))
      viewer.setFollow(true); viewer.seekFrame(15); viewer.setSpeed(.5)
      // Freeze the live loop to compare an exact playing state before/after await.
      viewer.renderer.setAnimationLoop(null)
      viewer.asset.playback.playing = true
      const capture = () => ({
        time: viewer.asset.playback.time, playing: viewer.asset.playback.playing,
        camera: viewer.camera.position.toArray(), rotation: viewer.camera.quaternion.toArray(), zoom: viewer.camera.zoom,
        target: viewer.navigation.controls.target.toArray(), follow: viewer.follow.mode,
        baseline: viewer.follow.snapshot().previous.toArray(), controls: viewer.navigation.controls.enabled,
        width: viewer.renderer.domElement.width, height: viewer.renderer.domElement.height,
      })
      const before = capture()
      const renders: number[][] = []
      const render = viewer.renderer.render.bind(viewer.renderer)
      viewer.renderer.render = (scene: unknown, camera: { position: { toArray: () => number[] } }) => {
        if (viewer.state.exporting) renders.push(camera.position.toArray())
        render(scene, camera)
      }
      await viewer.exportMovie('viewport')
      const success = capture(), error = viewer.state.error
      // Trigger cancellation only after the export has actually rendered frames.
      const oldPublish = viewer.publish
      viewer.publish = (state: { exportProgress: number; exporting: boolean }) => {
        oldPublish(state)
        if (state.exporting && state.exportProgress > .1) viewer.cancelExport()
      }
      await viewer.exportMovie('viewport')
      const cancel = capture(), cancelStatus = viewer.state.exportStatus
      viewer.publish = oldPublish
      // Force capability failure without affecting the library implementation.
      const encoder = globalThis.VideoEncoder
      Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, value: undefined })
      try { await viewer.exportMovie('viewport') } finally { Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, value: encoder }) }
      const failed = capture(), failError = viewer.state.error
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({ createWritable: async () => { throw new Error('Disk full') } }) })
      await viewer.exportMovie('viewport')
      return { before, success, cancel, failed, saveFailed: capture(), saveError: viewer.state.error, error, cancelStatus, failError,
        renderPositions: renders.slice(0, 61) }
    } finally { viewer.dispose(); div.remove() }
  }, makeFbx({ mesh: true }))
  expect(result.error).toBeNull()
  expect(result.success).toEqual(result.before)
  expect(result.cancel).toEqual(result.before)
  expect(result.failed).toEqual(result.before)
  expect(result.saveFailed).toEqual(result.before)
  expect(result.saveError).toBe('Disk full')
  expect(result.cancelStatus).toBe('Export cancelled')
  expect(result.failError).toContain('WebCodecs')
  expect(result.renderPositions).toHaveLength(61)
  expect(result.renderPositions[30][0] - result.renderPositions[0][0]).toBeCloseTo(80)
  expect(result.renderPositions[60][0]).toBeCloseTo(result.renderPositions[0][0])
  expect(new Set(result.renderPositions.map(p => p[1])).size).toBe(1)
})

test('1080p fractional-FPS export preserves every frame and no external requests', async ({ page }) => {
  test.setTimeout(90000)
  const unexpected: string[] = []
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/')) unexpected.push(request.url())
  })
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'fractional.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx()) })
  await page.getByLabel('Animation take').selectOption('1')
  const fps = 24000 / 1001
  await page.getByLabel('Timeline FPS').selectOption(String(fps))
  await page.getByLabel('Export resolution').selectOption('1080p')
  const downloading = page.waitForEvent('download', { timeout: 150000 })
  await page.getByRole('button', { name: 'EXPORT MP4' }).click()
  await expect(page.getByText('Export complete', { exact: true })).toBeVisible({ timeout: 150000 })
  const download = await downloading
  const input = new Input({ formats: [MP4], source: new BufferSource(await readFile((await download.path())!)) })
  try {
    const track = (await input.getPrimaryVideoTrack())!
    expect([track.displayWidth, track.displayHeight]).toEqual([1920, 1080])
    const times: number[] = []
    for await (const packet of new EncodedPacketSink(track).packets()) times.push(packet.timestamp)
    times.sort((a, b) => a - b)
    expect(times).toHaveLength(25)
    times.forEach((time, i) => expect(time).toBeCloseTo(i / fps, 5))
    expect(await track.computeDuration()).toBeCloseTo(25 / fps, 5)
  } finally { input.dispose() }
  expect(unexpected).toEqual([])
})

test('production FBX 6000 exports its full take with Follow enabled', async ({ page }) => {
  test.setTimeout(180000)
  test.skip(!process.env.FBX_LEGACY_SAMPLE, 'Set FBX_LEGACY_SAMPLE for the local production-file regression.')
  await page.setViewportSize({ width: 960, height: 800 })
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles(process.env.FBX_LEGACY_SAMPLE!)
  await expect(page.getByText('0 meshes · 25 bones · 1 takes')).toBeVisible()
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await page.getByLabel('Timeline scrub').fill('300')
  await page.getByLabel('Export resolution').selectOption('viewport')
  const downloading = page.waitForEvent('download', { timeout: 150000 })
  await page.getByRole('button', { name: 'EXPORT MP4' }).click()
  await expect(page.getByText('Export complete', { exact: true })).toBeVisible({ timeout: 150000 })
  await expect(page.getByLabel('Current frame')).toHaveValue('300')
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const download = await downloading
  const input = new Input({ formats: [MP4], source: new BufferSource(await readFile((await download.path())!)) })
  try {
    const track = (await input.getPrimaryVideoTrack())!
    let count = 0
    for await (const packet of new EncodedPacketSink(track).packets()) { expect(Number.isFinite(packet.timestamp)).toBe(true); count++ }
    expect(count).toBe(933)
    expect(await track.computeDuration()).toBeCloseTo(933 / 30, 5)
  } finally { input.dispose() }
  await page.screenshot({ path: 'test-results/v02-legacy-follow.png' })
})

test('save picker runs with user activation; cancel does not encode; save commits MP4 once', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'character_walk.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx()) })
  await page.getByLabel('Timeline scrub').fill('15')
  await page.getByLabel('Export resolution').selectOption('viewport')
  await page.evaluate(() => {
    const state = { calls: 0, activated: false, name: '', bytes: 0, closes: 0, cancel: true }
    Object.assign(window, { saveTest: state })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async (options: { suggestedName: string }) => {
      state.calls++; state.activated = navigator.userActivation.isActive; state.name = options.suggestedName
      if (state.cancel) throw new DOMException('User cancelled', 'AbortError')
      return { createWritable: async () => ({ write: async (blob: Blob) => { state.bytes = blob.size }, close: async () => { state.closes++ }, abort: async () => {} }) }
    } })
  })
  const exportModules: string[] = []
  page.on('request', request => { if (request.url().includes('PreviewExporter')) exportModules.push(request.url()) })
  const exportButton = page.getByRole('button', { name: 'EXPORT MP4' })
  await exportButton.click()
  await expect(page.getByText('Export cancelled', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Current frame')).toHaveValue('15')
  const cancelled = await page.evaluate(() => (window as unknown as { saveTest: { calls: number; bytes: number; activated: boolean; name: string } }).saveTest)
  expect(exportModules).toEqual([])
  expect(cancelled).toMatchObject({ calls: 1, bytes: 0, activated: true, name: 'character_walk.mp4' })
  await page.evaluate(() => { (window as unknown as { saveTest: { cancel: boolean } }).saveTest.cancel = false })
  await exportButton.click()
  await expect(exportButton).toBeDisabled()
  await expect(page.getByText('Export complete', { exact: true })).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('link', { name: 'Download MP4' })).toHaveCount(0)
  await expect(page.getByLabel('Current frame')).toHaveValue('15')
  const saved = await page.evaluate(() => (window as unknown as { saveTest: { calls: number; bytes: number; closes: number } }).saveTest)
  expect(saved.calls).toBe(2); expect(saved.bytes).toBeGreaterThan(1000); expect(saved.closes).toBe(1)
})

test('Follow fits once at current pose; infinite grid survives distant camera translations', async ({ page }) => {
  await page.goto('/')
  const errors: string[] = []
  page.on('console', e => { if (/GL_INVALID|THREE.WebGLProgram/.test(e.text())) errors.push(e.text()) })
  const result = await page.evaluate(async source => {
    const path = '/src/viewer/ViewerEngine.ts'
    const { ViewerEngine } = await import(/* @vite-ignore */ path)
    const div = document.createElement('div'); div.style.cssText = 'width:480px;height:360px'
    document.body.append(div)
    const viewer = new ViewerEngine(div, () => {})
    try {
      await viewer.load(new File([source], 'fit.fbx'))
      viewer.renderer.setAnimationLoop(null)
      viewer.seekFrame(30)
      viewer.camera.position.x += 100000
      viewer.navigation.controls.target.x += 100000
      let fits = 0
      const fit = viewer.navigation.fit.bind(viewer.navigation)
      viewer.navigation.fit = (root: unknown) => { fits++; fit(root) }
      viewer.setFollow(true)
      const centered = viewer.navigation.controls.target.x
      const before = viewer.camera.position.clone()
      viewer.camera.position.z += 70 // user dolly/pan: retain the new camera state
      viewer.navigation.controls.target.z += 70
      viewer.seekFrame(15); viewer.step(1); viewer.setFollow(true)
      const retained = viewer.camera.position.z - before.z
      viewer.setVisibility('meshVisible', false); viewer.setVisibility('boneVisible', false)
      const renderGrid = () => {
        viewer.renderer.render(viewer.scene, viewer.camera)
        return viewer.renderer.domElement.toDataURL()
      }
      const local = renderGrid()
      viewer.camera.position.x += 1000000; viewer.navigation.controls.target.x += 1000000
      viewer.navigation.controls.update()
      const distant = renderGrid()
      viewer.setVisibility('gridVisible', false)
      const empty = renderGrid()
      return { fits, centered, retained, localVisible: local !== empty, distantVisible: distant !== empty,
        vertices: viewer.grid.geometry.attributes.position.count }
    } finally { viewer.dispose(); div.remove() }
  }, makeFbx({ mesh: true }))
  expect(result.fits).toBe(1)
  expect(Math.abs(result.centered)).toBeLessThan(500)
  expect(result.retained).toBeCloseTo(70)
  expect(result.localVisible).toBe(true); expect(result.distantVisible).toBe(true)
  expect(result.vertices).toBe(4)
  expect(errors).toEqual([])
})

test('v0.2.2 repeated loops refit exact start; export motion ignores viewer frame/history', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/')
  const result = await page.evaluate(async source => {
    const path = '/src/viewer/ViewerEngine.ts'
    const { ViewerEngine } = await import(/* @vite-ignore */ path)
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} }) }) })
    const div = document.createElement('div'); div.style.cssText = 'width:322px;height:242px'; document.body.append(div)
    const v = new ViewerEngine(div, () => {})
    try {
      await v.load(new File([source], 'loop.fbx'))
      v.renderer.setAnimationLoop(null)
      v.setFollow(true)
      // Non-cyclic root motion makes end-to-start displacement observable.
      const track = v.asset.root.animations[0].tracks.find((t: {name: string}) => t.name.endsWith('.position'))
      track.values[track.values.length - 3] = 160
      const capture = () => ({ time: v.asset.playback.time, playing: v.asset.playback.playing,
        camera: { position: v.camera.position.toArray(), quaternion: v.camera.quaternion.toArray(), zoom: v.camera.zoom, near: v.camera.near, far: v.camera.far, fov: v.camera.fov, aspect: v.camera.aspect }, target: v.navigation.controls.target.toArray(),
        baseline: v.follow.snapshot().previous.toArray(), mode: v.follow.mode, enabled: v.state.follow })
      let fits = 0
      const fit = v.navigation.fit.bind(v.navigation)
      v.navigation.fit = (root: unknown) => { fits++; fit(root) }
      const starts = []
      for (let i = 0; i < 4; i++) {
        v.asset.playback.playing = true
        v.updatePose(v.asset.playback.advance(v.asset.playback.duration / 2))
        const wrapped = v.asset.playback.advance(v.asset.playback.duration / 2)
        v.updatePose(wrapped)
        starts.push(v.camera.position.toArray())
      }
      const paths: number[][][] = [], restored: boolean[] = [], statuses: string[] = []
      const render = v.renderer.render.bind(v.renderer)
      let current: number[][] = []
      v.renderer.render = (scene: unknown, camera: { position: { toArray(): number[] } }) => {
        if (v.state.exporting) current.push(camera.position.toArray())
        render(scene, camera)
      }
      for (const frame of [0, 30, 59]) {
        v.seekFrame(frame)
        // Arbitrary previous pan/dolly and Follow history must be removed by start Fit.
        v.camera.position.x += frame * 3; v.navigation.controls.target.x += frame * 3
        const before = JSON.stringify(capture())
        current = []
        await v.exportMovie('viewport')
        paths.push(current); restored.push(JSON.stringify(capture()) === before); statuses.push(v.state.exportStatus)
      }
      return { starts, fits, paths, restored, statuses }
    } finally { v.dispose(); div.remove() }
  }, makeFbx({ mesh: true }))
  expect(result.fits).toBe(4)
  result.starts.forEach(position => position.forEach((n: number, i: number) => expect(n).toBeCloseTo(result.starts[0][i], 9)))
  expect(result.restored).toEqual([true, true, true])
  expect(result.statuses).toEqual(['Export complete', 'Export complete', 'Export complete'])
  expect(result.paths[0]).toHaveLength(61)
  for (const path of result.paths.slice(1)) path.forEach((p, frame) => p.forEach((n, axis) => expect(n).toBeCloseTo(result.paths[0][frame][axis], 8)))
})

test('16:9 guide resizes without intercepting navigation or changing canvas pixels', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'guide.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx()) })
  await expect(page.getByLabel('Current frame')).toBeEnabled()
  const canvas = page.locator('canvas')
  const before = await canvas.screenshot()
  await page.getByRole('button', { name: '16:9 Frame Guide', exact: true }).click()
  const guide = page.getByTestId('frame-guide')
  await expect(guide).toBeVisible()
  for (const viewport of [{ width: 1440, height: 960 }, { width: 900, height: 1100 }, { width: 1600, height: 700 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(async () => { const b = await guide.boundingBox(); return b ? b.width / b.height : 0 }).toBeCloseTo(16 / 9, 3)
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBe(viewport.width)
    await expect.poll(async () => { const c = (await canvas.boundingBox())!, g = (await guide.boundingBox())!; return Math.abs(g.x + g.width / 2 - c.x - c.width / 2) }).toBeLessThan(1)
    const bounds = (await canvas.boundingBox())!, box = (await guide.boundingBox())!
    expect(box.width).toBeLessThanOrEqual(bounds.width + 1); expect(box.height).toBeLessThanOrEqual(bounds.height + 1)
    expect(box.x + box.width / 2).toBeCloseTo(bounds.x + bounds.width / 2, 0)
    expect(await guide.evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none')
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: '16:9 Frame Guide', exact: true }).click()
  await expect(guide).toHaveCount(0)
  expect((await canvas.screenshot()).equals(before)).toBe(true)
  await expect(page.getByLabel('Export resolution')).toHaveValue('720p')
})
