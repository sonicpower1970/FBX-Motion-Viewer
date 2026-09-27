import { expect, test } from 'vitest'
import { BoxGeometry, Mesh, PerspectiveCamera, Vector3 } from 'three'
import { exportCamera, applyExportProjection } from '../../src/viewer/exportCamera'
import { fitCamera } from '../../src/viewer/CameraController'
import { frameRect } from '../../src/utils/frameGuide'

for (const [width, height] of [[1600, 600], [900, 1100], [1280, 720]]) {
  test(`16:9 projection equals viewer guide coordinates at ${width}x${height}`, () => {
    const camera = new PerspectiveCamera(47, width / height, .1, 10000)
    camera.position.set(2, 3, 20); camera.lookAt(0, 0, 0); camera.zoom = 1.7
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    const original = camera.projectionMatrix.clone()
    const output = exportCamera(camera, 16 / 9, true)
    const gate = frameRect(width, height, 16 / 9)
    for (const point of [new Vector3(), new Vector3(2, -1, 3), new Vector3(-4, 2, -2)]) {
      const view = point.clone().project(camera), projected = point.clone().project(output)
      const x = (((view.x + 1) / 2 * width) - gate.x) / gate.width
      const y = (((1 - view.y) / 2 * height) - gate.y) / gate.height
      expect((projected.x + 1) / 2).toBeCloseTo(x, 12)
      expect((1 - projected.y) / 2).toBeCloseTo(y, 12)
    }
    expect(output.position).toEqual(camera.position); expect(output.quaternion.toArray()).toEqual(camera.quaternion.toArray())
    expect(output.zoom).toBe(camera.zoom); expect(camera.projectionMatrix).toEqual(original)
    expect(exportCamera(camera, width / height, false).projectionMatrix).toEqual(original)
  })
  test(`guide-aware one-shot Fit matches export START Fit at ${width}x${height}`, () => {
    const live = new PerspectiveCamera(42, width / height, .1, 10000)
    live.position.set(100, 80, 200); live.lookAt(0, 0, 0); live.updateMatrixWorld(true)
    const movie = live.clone()
    const root = new Mesh(new BoxGeometry(10, 20, 5))
    fitCamera(live, new Vector3(), root, 16 / 9)
    fitCamera(movie, new Vector3(), root, 16 / 9)
    applyExportProjection(movie, 16 / 9, true)
    expect(movie.position.distanceTo(live.position)).toBeLessThan(1e-10)
    root.geometry.dispose()
  })
}

test('crop uses actual asymmetric projection and preserves lens/viewer state', () => {
  const viewer = new PerspectiveCamera(51, 2, .1, 900)
  viewer.zoom = 1.8; viewer.filmOffset = 4
  viewer.setViewOffset(2000, 1000, 180, 80, 1400, 700)
  viewer.updateProjectionMatrix()
  const original = viewer.projectionMatrix.toArray()
  const output = exportCamera(viewer, 16 / 9, true)
  const rect = frameRect(viewer.aspect, 1, 16 / 9)
  for (const p of [new Vector3(0,0,-10), new Vector3(2,1,-20)]) {
    const a = p.clone().project(viewer), b = p.clone().project(output)
    expect((b.x+1)/2).toBeCloseTo(((a.x+1)/2*viewer.aspect-rect.x)/rect.width, 12)
    expect((1-b.y)/2).toBeCloseTo(((1-a.y)/2-rect.y)/rect.height, 12)
  }
  expect(output.fov).toBe(viewer.fov); expect(output.zoom).toBe(viewer.zoom)
  output.projectionMatrix.clone().multiply(output.projectionMatrixInverse).elements.forEach((value, i) => {
    expect(value).toBeCloseTo(i % 5 === 0 ? 1 : 0, 12)
  })
  expect(viewer.projectionMatrix.toArray()).toEqual(original)
})
