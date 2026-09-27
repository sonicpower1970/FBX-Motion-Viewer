import { describe, expect, it } from 'vitest'
import { AnimationClip, Group, NumberKeyframeTrack } from 'three'
import { PlaybackController } from '../../src/viewer/PlaybackController'

function setup() {
  const root = new Group()
  const controller = new PlaybackController(root)
  controller.select(new AnimationClip('Travel', 2, [new NumberKeyframeTrack('.position[x]', [0, 2], [0, 20])]))
  return { root, controller }
}
describe('playback and actual evaluated pose', () => {
  it('seeks backwards after a non-looping end and resumes correctly', () => {
    const { root, controller } = setup()
    controller.loop = false
    controller.toggle()
    controller.advance(3)
    expect(controller.playing).toBe(false)
    expect(root.position.x).toBe(20)
    controller.seek(0.5)
    expect(root.position.x).toBe(5)
    controller.toggle()
    controller.advance(0.5)
    expect(root.position.x).toBe(10)
    controller.dispose()
  })
  it('wraps large loop deltas and holds time while paused', () => {
    const { root, controller } = setup()
    controller.toggle()
    controller.advance(5)
    expect(controller.time).toBe(1)
    expect(root.position.x).toBe(10)
    controller.toggle()
    controller.advance(0.5)
    expect(root.position.x).toBe(10)
  })
  it('steps while paused and keeps time when FPS changes', () => {
    const { root, controller } = setup()
    controller.seek(1)
    controller.fps = 24
    expect(controller.time).toBe(1)
    controller.step(-1)
    expect(controller.time).toBe(23 / 24)
    expect(root.position.x).toBeCloseTo(10 * 23 / 24)
    expect(controller.playing).toBe(false)
  })
  it('resets time and restores untracked transforms when changing clips', () => {
    const { root, controller } = setup()
    controller.seek(1)
    controller.select(new AnimationClip('Lift', 1, [new NumberKeyframeTrack('.position[y]', [0, 1], [0, 5])]))
    expect(root.position.x).toBe(0)
    expect(controller.time).toBe(0)
    controller.seek(1)
    expect(root.position.y).toBe(5)
    controller.select()
    expect(root.position.y).toBe(0)
    expect(controller.duration).toBe(0)
  })
})
