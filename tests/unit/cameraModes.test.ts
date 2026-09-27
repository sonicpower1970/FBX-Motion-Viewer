import { expect, test, vi } from 'vitest'
import { AnimationClip, Bone, Group, PerspectiveCamera, Vector3, VectorKeyframeTrack } from 'three'
import { ViewerEngine } from '../../src/viewer/ViewerEngine'
import { FollowController } from '../../src/viewer/FollowController'
import { PlaybackController } from '../../src/viewer/PlaybackController'
import { fitCamera } from '../../src/viewer/CameraController'
import { INITIAL_SNAPSHOT } from '../../src/types/viewer'
import type { ViewerSnapshot } from '../../src/types/viewer'

// Exercise production engine policy with real animation/Fit/Follow and no GPU/DOM.
function harness() {
  const root = new Group(), bone = new Bone(), tip = new Bone()
  bone.name = 'Root'; tip.position.y = 10; root.add(bone); bone.add(tip)
  const playback = new PlaybackController(root)
  playback.select(new AnimationClip('Travel', 2, [new VectorKeyframeTrack('Root.position', [0, 2], [0, 0, 0, 160, 0, 80])]))
  const camera = new PerspectiveCamera(35, 16 / 9), target = new Vector3()
  camera.position.set(20, 5, 100); camera.lookAt(target)
  const follow = new FollowController(camera, target); follow.attach(bone)
  const fit = vi.fn(() => fitCamera(camera, target, root))
  const engine = Object.assign(Object.create(ViewerEngine.prototype), {
    state: { ...INITIAL_SNAPSHOT }, asset: { root, playback }, follow,
    navigation: { fit }, ground: { update: vi.fn() }, publish: vi.fn(), disposed: false,
  }) as { state: ViewerSnapshot; setFitEnabled(on: boolean): void; setFollow(on: boolean): void; updatePose(loop?: boolean): void; fit(): void }
  return { engine, playback, camera, target, follow, fit }
}

test('FIT toggle fits once on OFF→ON; OFF and repeated ON preserve camera; F command does not toggle', () => {
  const { engine, camera, target, fit } = harness()
  engine.setFitEnabled(false)
  const before = camera.position.clone(), oldTarget = target.clone()
  expect(fit).not.toHaveBeenCalled(); expect(camera.position).toEqual(before)
  engine.setFitEnabled(true)
  expect(fit).toHaveBeenCalledTimes(1); expect(engine.state.fitEnabled).toBe(true)
  expect(camera.position).not.toEqual(before); expect(target).not.toEqual(oldTarget)
  const fitted = camera.position.clone()
  engine.setFitEnabled(true); engine.setFitEnabled(false)
  expect(camera.position).toEqual(fitted); expect(fit).toHaveBeenCalledTimes(1)
  engine.fit(); expect(engine.state.fitEnabled).toBe(false); expect(fit).toHaveBeenCalledTimes(2)
})

for (const fitting of [false, true]) for (const following of [false, true]) {
  test(`engine loop policy FIT=${fitting} FOLLOW=${following} over 12 loops`, () => {
    const { engine, playback, camera, target, follow, fit } = harness()
    engine.setFitEnabled(fitting); engine.setFollow(following)
    const initialCamera = camera.position.clone(), initialTarget = target.clone()
    const rootRelative = camera.position.clone().sub(follow.position())
    playback.playing = true
    const initialFits = fit.mock.calls.length
    for (let loop = 0; loop < 12; loop++) {
      for (let frame = 0; frame < 8; frame++) engine.updatePose(playback.advance(.25))
      expect(playback.time).toBe(0)
      if (!fitting) {
        expect(camera.position.distanceTo(initialCamera)).toBeLessThan(1e-9)
        expect(target.distanceTo(initialTarget)).toBeLessThan(1e-9)
        if (following) expect(camera.position.clone().sub(follow.position()).distanceTo(rootRelative)).toBeLessThan(1e-9)
      }
      expect(follow.snapshot().previous?.distanceTo(follow.position())).toBe(0)
    }
    expect(fit.mock.calls.length - initialFits).toBe(fitting ? 12 : 0)
    playback.dispose()
  })
}
