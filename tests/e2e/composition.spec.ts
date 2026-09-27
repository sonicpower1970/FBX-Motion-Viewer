import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { makeFbx } from '../fixtures/fbx'

for (const scenario of [
  { name: 'A-start-fixed', frame: 0, follow: false, fit: false },
  { name: 'B-mid-fixed', frame: 30, follow: false, fit: false },
  { name: 'C-mid-follow', frame: 30, follow: true, fit: false },
  { name: 'D-start-fit', frame: 30, follow: true, fit: true },
]) test(`${scenario.name}: guide composition and Burn-in match encoded MP4`, async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('/')
  const result = await page.evaluate(async ({ source, scenario }) => {
    const enginePath = '/src/viewer/ViewerEngine.ts'
    const { ViewerEngine } = await import(/* @vite-ignore */ enginePath)
    let movie = new Blob()
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({ createWritable: async () => ({ write: async (blob: Blob) => { movie = blob }, close: async () => {}, abort: async () => {} }) }) })
    const div = document.createElement('div'); div.style.cssText = 'position:fixed;inset:0;width:900px;height:800px'; document.body.append(div)
    const v = new ViewerEngine(div, () => {})
    try {
      await v.load(new File([source], 'composition_walk.fbx'))
      v.renderer.setAnimationLoop(null)
      v.setFitEnabled(false)
      v.setFrameGuide('16:9'); v.setBurnIn(true); v.fit()
      v.setFollow(scenario.follow); v.seekFrame(scenario.frame)
      v.state.fitEnabled = scenario.fit
      v.camera.position.x += 7; v.navigation.controls.target.x += 7
      v.camera.zoom = 1.1; v.camera.updateProjectionMatrix(); v.camera.updateMatrixWorld(true)
      const state = () => ({ position: v.camera.position.toArray(), quaternion: v.camera.quaternion.toArray(), zoom: v.camera.zoom,
        projection: v.camera.projectionMatrix.toArray(), inverse: v.camera.projectionMatrixInverse.toArray(),
        target: v.navigation.controls.target.toArray(), time: v.asset.playback.time, playing: v.asset.playback.playing,
        mode: v.follow.mode, previous: v.follow.snapshot().previous.toArray() })
      const originalState = state()
      const before = JSON.stringify(originalState)
      const inspectedRoot = v.follow.position().clone()
      let fits = 0
      v.navigation.fit = () => { fits++; throw new Error('Export must not Fit live camera') }
      const reference = v.camera.clone(), referenceTarget = v.navigation.controls.target.clone()
      v.asset.playback.seek(0)
      if (scenario.fit) {
        const fitPath = '/src/viewer/CameraController.ts'
        const { fitCamera } = await import(/* @vite-ignore */ fitPath)
        fitCamera(reference, referenceTarget, v.asset.root, 16 / 9)
      } else if (scenario.follow) {
        const offset = v.follow.position().clone().sub(inspectedRoot)
        reference.position.add(offset); referenceTarget.add(offset); reference.updateMatrixWorld(true)
      }
      const expected = { position: reference.position.toArray(), quaternion: reference.quaternion.toArray(), zoom: reference.zoom }
      v.renderer.render(v.scene, reference); v.drawBurnIn()
      const preview = document.createElement('canvas'); preview.width = 1920; preview.height = 1080
      const context = preview.getContext('2d')!
      const scene = v.renderer.domElement
      const gateHeight = scene.width * 9 / 16, top = (scene.height - gateHeight) / 2
      context.drawImage(scene, 0, top, scene.width, gateHeight, 0, 0, 1920, 1080)
      context.drawImage(v.burnIn.canvas, 0, top, scene.width, gateHeight, 0, 0, 1920, 1080)
      const previewImage = preview.toDataURL()
      v.asset.playback.seek(originalState.time)
      const cameras: { p: number[]; q: number[]; z: number; aspect: number }[] = []
      const render = v.renderer.render.bind(v.renderer)
      v.renderer.render = (scene: unknown, camera: {position: {toArray(): number[]}; quaternion: {toArray(): number[]}; zoom: number; aspect: number}) => {
        if (v.state.exporting) cameras.push({ p: camera.position.toArray(), q: camera.quaternion.toArray(), z: camera.zoom, aspect: camera.aspect })
        render(scene, camera)
      }
      await v.exportMovie('1080p')
      if (JSON.stringify(state()) !== before) throw new Error('State restoration failed')
      const status = v.state.exportStatus
      const library = performance.getEntriesByType('resource').map(e => e.name).find(n => /\/mediabunny\.js(?:\?|$)/.test(n))!
      const { Input, BlobSource, MP4, VideoSampleSink } = await import(/* @vite-ignore */ library)
      const input = new Input({ formats: [MP4], source: new BlobSource(movie) })
      let movieImage = '', difference = 0
      try {
        const track = await input.getPrimaryVideoTrack(), sample = await new VideoSampleSink(track).getSample(0)
        const decoded = document.createElement('canvas'); decoded.width = 1920; decoded.height = 1080
        const ctx = decoded.getContext('2d')!
        try { sample.draw(ctx, 0, 0) } finally { sample.close() }
        movieImage = decoded.toDataURL()
        const a = context.getImageData(0, 0, 1920, 1080).data, b = ctx.getImageData(0, 0, 1920, 1080).data
        for (let i = 0; i < a.length; i += 4) difference += Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2])
        difference /= 1920 * 1080 * 3
      } finally { input.dispose() }
      const fixedCameras = cameras.slice()
      cameras.length = 0
      if (!scenario.follow && !scenario.fit) await v.exportMovie('viewport')
      return { status, fits, difference, previewImage, movieImage, cameras, fixedCameras, original: expected, viewportStatus: v.state.exportStatus }
    } finally { v.dispose(); div.remove() }
  }, { source: makeFbx({ mesh: true }), scenario })
  expect(result.status).toBe('Export complete'); expect(result.viewportStatus).toBe('Export complete')
  expect(result.fits).toBe(0)
  expect(result.difference).toBeLessThan(6) // raster scaling, AA and H.264 tolerance
  expect(result.cameras).toHaveLength(scenario.follow || scenario.fit ? 0 : 61)
  expect(result.fixedCameras).toHaveLength(61)
  result.fixedCameras.forEach((camera, i) => {
    if (!scenario.follow || i === 0) camera.p.forEach((n, j) => expect(n).toBeCloseTo(result.original.position[j], 10)); expect(camera.q).toEqual(result.original.quaternion)
    expect(camera.z).toBe(result.original.zoom); expect(camera.aspect).toBe(16 / 9)
  })
  result.cameras.forEach(camera => {
    expect(camera.p).toEqual(result.original.position); expect(camera.q).toEqual(result.original.quaternion)
    expect(camera.z).toBe(result.original.zoom); expect(camera.aspect).toBe(900 / 800)
  })
  await writeFile(`test-results/${scenario.name}-guide.png`, Buffer.from(result.previewImage.split(',')[1], 'base64'))
  await writeFile(`test-results/${scenario.name}-movie.png`, Buffer.from(result.movieImage.split(',')[1], 'base64'))
})
