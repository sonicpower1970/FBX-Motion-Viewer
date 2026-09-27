import { expect, test } from 'vitest'
import { AnimationClip, Bone, Group, PerspectiveCamera, Vector3, VectorKeyframeTrack } from 'three'
import { PlaybackController } from '../../src/viewer/PlaybackController'
import { FollowController } from '../../src/viewer/FollowController'

function setup() {
  const root = new Group(), bone = new Bone(); bone.name = 'Root'; root.add(bone)
  const clip = new AnimationClip('Travel', 2, [new VectorKeyframeTrack('Root.position', [0, 2], [100, 0, -30, 260, 0, 50])])
  const playback = new PlaybackController(root); playback.select(clip)
  const camera = new PerspectiveCamera(27, 16 / 9, .1, 10000), target = new Vector3(105, 12, -20)
  camera.position.set(130, 8, 120); camera.lookAt(target); camera.zoom = 1.6; camera.updateProjectionMatrix()
  const follow = new FollowController(camera, target); follow.attach(bone); follow.setMode('ground')
  return { root, bone, playback, camera, target, follow }
}

for (const duration of [.1, .137, 4.17]) test(`12+ loops preserve relative composition with playback delta ${duration}`, () => {
  const { playback, camera, target, follow } = setup()
  let cameraOffset = camera.position.clone().sub(follow.position())
  let targetOffset = target.clone().sub(follow.position())
  const rotation = camera.quaternion.toArray(), projection = camera.projectionMatrix.toArray()
  playback.playing = true
  let loops = 0
  for (let i = 0; loops < 12; i++) {
    const wrapped = playback.advance(duration)
    if (wrapped) {
      const remainder = playback.time
      playback.seek(0)
      follow.rebaseLoopPreservingComposition()
      playback.seek(remainder)
      loops++
    }
    follow.update()
    expect(camera.position.clone().sub(follow.position()).distanceTo(cameraOffset)).toBeLessThan(1e-9)
    expect(target.clone().sub(follow.position()).distanceTo(targetOffset)).toBeLessThan(1e-9)
    expect(camera.position.distanceTo(target)).toBeCloseTo(cameraOffset.distanceTo(targetOffset), 10)
    expect(camera.quaternion.toArray()).toEqual(rotation)
    expect(camera.projectionMatrix.toArray()).toEqual(projection)
    expect(camera.zoom).toBe(1.6)
    if (i === 3) { // User pan/dolly must also survive subsequent loop rebases.
      camera.position.add(new Vector3(-17, 0, 23)); target.add(new Vector3(-3, 0, 2))
      cameraOffset = camera.position.clone().sub(follow.position()); targetOffset = target.clone().sub(follow.position())
    }
  }
  playback.dispose()
})

test('Follow OFF leaves camera and target fixed at loop reset', () => {
  const { playback, follow, camera, target } = setup()
  follow.setMode('off')
  const p = camera.position.clone(), t = target.clone()
  for (let i = 0; i < 12; i++) {
    playback.seek(1.9); follow.update(); playback.seek(0); follow.rebaseLoopPreservingComposition()
    expect(camera.position).toEqual(p); expect(target).toEqual(t)
  }
})

test('reference-only reset for export does not apply current-to-START displacement', () => {
  const { playback, follow, camera, target } = setup()
  playback.seek(1.5); follow.update()
  const p = camera.position.clone(), t = target.clone(), snapshot = follow.snapshot()
  playback.seek(0); follow.resetFollowReferenceWithoutMovingCamera()
  expect(camera.position).toEqual(p); expect(target).toEqual(t)
  playback.seek(.5); follow.update()
  expect(camera.position.clone().sub(p).toArray()).toEqual([40, 0, 20])
  follow.restore(snapshot)
  expect(follow.snapshot()).toEqual(snapshot)
})

test('backward scrub follows actual displacement; non-finite positions safely resynchronize', () => {
  const { playback, follow, camera, bone } = setup()
  const original = camera.position.clone()
  playback.seek(1.8); follow.update(); playback.seek(.2); follow.update()
  expect(camera.position.clone().sub(original).distanceTo(new Vector3(16, 0, 8))).toBeLessThan(1e-6)
  const before = camera.position.clone()
  bone.position.x = Infinity; bone.updateMatrixWorld(true); follow.update()
  expect(camera.position).toEqual(before)
  playback.seek(0); follow.update() // invalid reference is discarded, no jump on recovery
  expect(camera.position).toEqual(before)
})

test('export moves a cloned manual composition from middle pose to START without Fit or live-camera mutation', () => {
  const { playback, follow, camera, target } = setup()
  playback.seek(1.5); follow.update()
  camera.position.add(new Vector3(13, -2, 25)); target.add(new Vector3(4, 2, 6))
  const inspected = follow.position(), livePosition = camera.position.clone(), liveTarget = target.clone()
  const positionOffset = camera.position.clone().sub(inspected), targetOffset = target.clone().sub(inspected)
  const output = camera.clone(), exportTarget = target.clone(), exportFollow = new FollowController(output, exportTarget)
  exportFollow.attach(follow.target!); exportFollow.setMode('ground')
  playback.seek(0)
  exportFollow.rebaseExportFrom(inspected)
  expect(output.position.clone().sub(follow.position()).distanceTo(positionOffset)).toBeLessThan(1e-10)
  expect(exportTarget.clone().sub(follow.position()).distanceTo(targetOffset)).toBeLessThan(1e-10)
  expect(output.quaternion.toArray()).toEqual(camera.quaternion.toArray())
  expect(output.fov).toBe(camera.fov); expect(output.zoom).toBe(camera.zoom)
  expect(camera.position).toEqual(livePosition); expect(target).toEqual(liveTarget)
  playback.seek(.5); exportFollow.update()
  expect(output.position.clone().sub(follow.position()).distanceTo(positionOffset)).toBeLessThan(1e-10)
})
