import { expect, test } from '@playwright/test'
import { makeFbx } from '../fixtures/fbx'

for (const following of [false, true]) for (const fitEnabled of [false, true]) {
  test(`camera modes FOLLOW=${following} FIT=${fitEnabled}: playback/scrub/loop/export`, async ({ page }) => {
    test.setTimeout(90000)
    await page.goto('/')
    const result = await page.evaluate(async ({ source, following, fitEnabled }) => {
      const path = '/src/viewer/ViewerEngine.ts'
      const { ViewerEngine } = await import(/* @vite-ignore */ path)
      let failSave = false, bytes = 0
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({ createWritable: async () => {
        if (failSave) throw new Error('Simulated disk error')
        return { write: async (blob: Blob) => { bytes += blob.size }, close: async () => {}, abort: async () => {} }
      } }) })
      const div = document.createElement('div'); div.style.cssText = 'width:400px;height:300px'; document.body.append(div)
      const v = new ViewerEngine(div, () => {})
      try {
        await v.load(new File([source], 'modes.fbx')); v.renderer.setAnimationLoop(null)
        const track = v.asset.root.animations[0].tracks.find((t: {name: string}) => t.name.endsWith('.position'))
        track.values[track.values.length - 3] = 160 // non-cyclic root motion
        let fits = 0
        const fit = v.navigation.fit.bind(v.navigation)
        v.navigation.fit = (...args: unknown[]) => { fits++; return fit(...args) }
        const camera = () => ({ p: v.camera.position.toArray(), q: v.camera.quaternion.toArray(), zoom: v.camera.zoom,
          projection: v.camera.projectionMatrix.toArray(), target: v.navigation.controls.target.toArray() })
        const snapshot = () => ({ camera: camera(), time: v.asset.playback.time, playing: v.asset.playback.playing,
          fitEnabled: v.state.fitEnabled, follow: v.state.follow, mode: v.follow.mode, baseline: v.follow.snapshot().previous.toArray() })
        v.camera.position.set(220, 15, 340); v.navigation.controls.target.set(20, 55, 0)
        v.navigation.controls.update(); v.camera.zoom = 1.4; v.camera.updateProjectionMatrix()
        const manual = camera()
        v.setFitEnabled(fitEnabled)
        const togglePreserved = JSON.stringify(camera()) === JSON.stringify(manual)
        v.setFollow(following)
        const activationFits = fits
        const activationPreserved = JSON.stringify(camera()) === JSON.stringify(manual)
        const deltas: { actual: number[]; expected: number[]; target: number[]; angleStable: boolean }[] = []
        const move = (action: () => void) => {
          const p = v.camera.position.clone(), t = v.navigation.controls.target.clone(), root = v.follow.position()
          const q = v.camera.quaternion.toArray(), zoom = v.camera.zoom
          action()
          const expected = v.follow.position().sub(root); expected.y = 0
          if (!following) expected.set(0, 0, 0)
          deltas.push({ actual: v.camera.position.clone().sub(p).toArray(), target: v.navigation.controls.target.clone().sub(t).toArray(), expected: expected.toArray(),
            angleStable: JSON.stringify(q) === JSON.stringify(v.camera.quaternion.toArray()) && zoom === v.camera.zoom })
        }
        move(() => { v.asset.playback.playing = true; v.updatePose(v.asset.playback.advance(.5)) })
        move(() => v.seekFrame(30))
        move(() => v.step(1))
        // A further user pan/dolly remains the basis for ordinary Follow deltas.
        v.camera.position.z += 35; v.navigation.controls.target.z += 35
        move(() => v.seekFrame(45))
        const beforeLoop = camera(), fitsBeforeLoop = fits
        const beforeLoopRoot = v.follow.position()
        v.asset.playback.playing = true
        v.updatePose(v.asset.playback.advance(v.asset.playback.duration - v.asset.playback.time))
        const loopFits = fits - fitsBeforeLoop, loopPreserved = JSON.stringify(camera()) === JSON.stringify(beforeLoop)
        const loopDelta = v.follow.position().sub(beforeLoopRoot); loopDelta.y = 0
        if (!following) loopDelta.set(0, 0, 0)
        const afterLoop = camera()
        const startBaseline = v.follow.snapshot().previous.distanceTo(v.follow.position())
        move(() => { v.asset.playback.playing = true; v.updatePose(v.asset.playback.advance(.25)) })
        v.seekFrame(15)
        v.camera.position.x += 73; v.navigation.controls.target.x += 73
        v.camera.updateMatrixWorld(true)
        v.asset.playback.playing = true
        const inspectedRoot = v.follow.position().toArray()
        const before = snapshot(), frames: number[][] = []
        const render = v.renderer.render.bind(v.renderer)
        v.renderer.render = (scene: unknown, cam: {position: {toArray(): number[]}}) => {
          if (v.state.exporting) frames.push(cam.position.toArray())
          render(scene, cam)
        }
        await v.exportMovie('viewport')
        const success = snapshot(), status = v.state.exportStatus, movieFrames = frames.slice()
        const publish = v.publish
        v.publish = (state: { exporting: boolean; exportProgress: number }) => {
          publish(state)
          if (state.exporting) { v.setFitEnabled(!fitEnabled); v.setFollow(!following) }
          if (state.exporting && state.exportProgress > .1) v.cancelExport()
        }
        await v.exportMovie('viewport')
        const cancelled = snapshot(), cancelStatus = v.state.exportStatus
        v.publish = publish; failSave = true
        await v.exportMovie('viewport')
        const failed = snapshot(), failureStatus = v.state.exportStatus
        return { activationFits, activationPreserved, togglePreserved, deltas, loopFits, loopPreserved, startBaseline, beforeLoop, afterLoop, loopDelta: loopDelta.toArray(),
          inspectedRoot, before, success, cancelled, failed, status, cancelStatus, failureStatus, movieFrames, bytes }
      } finally { v.dispose(); div.remove() }
    }, { source: makeFbx({ mesh: true }), following, fitEnabled })
    expect(result.togglePreserved).toBe(true)
    expect(result.activationFits).toBe(following && fitEnabled ? 1 : 0)
    if (!fitEnabled) expect(result.activationPreserved).toBe(true)
    result.deltas.forEach(delta => {
      delta.actual.forEach((value, axis) => expect(value).toBeCloseTo(delta.expected[axis], 8))
      delta.target.forEach((value, axis) => expect(value).toBeCloseTo(delta.expected[axis], 8))
      expect(delta.angleStable).toBe(true)
    })
    expect(result.loopFits).toBe(fitEnabled ? 1 : 0)
    if (!fitEnabled) {
      result.afterLoop.p.forEach((n: number, axis: number) => expect(n - result.beforeLoop.p[axis]).toBeCloseTo(result.loopDelta[axis], 8))
      result.afterLoop.target.forEach((n: number, axis: number) => expect(n - result.beforeLoop.target[axis]).toBeCloseTo(result.loopDelta[axis], 8))
      expect(result.afterLoop.q).toEqual(result.beforeLoop.q)
      expect(result.afterLoop.zoom).toBe(result.beforeLoop.zoom)
    }
    expect(result.startBaseline).toBe(0)
    expect(result.movieFrames).toHaveLength(61)
    if (!fitEnabled) result.movieFrames[0].forEach((n, axis) => expect(n).toBeCloseTo(result.before.camera.p[axis] - (following ? result.inspectedRoot[axis] : 0), 8))
    else expect(result.movieFrames[0]).not.toEqual(result.before.camera.p)
    expect(result.movieFrames[30][0] - result.movieFrames[0][0]).toBeCloseTo(following ? 80 : 0, 7)
    expect(result.movieFrames[60][0] - result.movieFrames[0][0]).toBeCloseTo(following ? 160 : 0, 7)
    expect(result.success).toEqual(result.before); expect(result.cancelled).toEqual(result.before); expect(result.failed).toEqual(result.before)
    expect(result.status).toBe('Export complete'); expect(result.cancelStatus).toBe('Export cancelled'); expect(result.failureStatus).toBe('Export failed')
    expect(result.bytes).toBeGreaterThan(1000)
  })
}

test('FIT toggle replaces AUTO FIT, fits on activation and leaves camera on deactivation', async ({ page }) => {
  await page.goto('/')
  const fit = page.getByRole('button', { name: 'FIT', exact: true })
  await expect(fit).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'AUTO FIT', exact: true })).toHaveCount(0)
  await fit.click()
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
  await page.getByLabel('Open FBX file').setInputFiles({ name: 'manual.fbx', mimeType: 'application/octet-stream', buffer: Buffer.from(makeFbx()) })
  await expect(page.getByLabel('Current frame')).toBeEnabled()
  const before = await page.locator('canvas').screenshot()
  await fit.click()
  await expect(fit).toHaveAttribute('aria-pressed', 'true')
  const fitted = await page.locator('canvas').screenshot()
  expect(fitted.equals(before)).toBe(false)
  await fit.click()
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
  expect((await page.locator('canvas').screenshot()).equals(fitted)).toBe(true)
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
  await page.locator('canvas').focus(); await page.keyboard.press('f')
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
})
