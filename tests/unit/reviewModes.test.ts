import { describe, expect, it } from 'vitest'
import { AnimationClip, Bone, Box3, DirectionalLight, Group, Mesh, NumberKeyframeTrack, PerspectiveCamera, Scene, Vector3 } from 'three'
import { FollowController, findFollowTarget } from '../../src/viewer/FollowController'
import { PlaybackController } from '../../src/viewer/PlaybackController'
import { GroundShadow } from '../../src/viewer/GroundShadow'
import { AssetInstance } from '../../src/viewer/AssetInstance'

function rig() {
  const root = new Group(), bone = new Bone(), camera = new PerspectiveCamera(), target = new Vector3()
  bone.name = 'Hips'; root.add(bone); camera.position.set(5, 8, 12)
  const clip = new AnimationClip('Travel', 2, [new NumberKeyframeTrack('Hips.position[x]', [0, 2], [0, 20]), new NumberKeyframeTrack('Hips.position[y]', [0, 2], [0, 5])])
  root.animations = [clip]
  const playback = new PlaybackController(root); playback.select(clip)
  const follow = new FollowController(camera, target); follow.attach(findFollowTarget(root, clip)); follow.setMode('ground')
  return { root, bone, clip, camera, target, playback, follow }
}
describe('review modes', () => {
  it.each([0.25, 0.5, 1, 2])('speed %s affects realtime only, never stepping', speed => {
    const { playback } = rig(); playback.speed = speed; playback.toggle(); playback.advance(.2)
    expect(playback.time).toBeCloseTo(.2 * speed)
    playback.seek(1); playback.step(1); expect(playback.time).toBeCloseTo(31 / 30)
    playback.step(-1); expect(playback.time).toBeCloseTo(1)
    playback.dispose()
  })
  it('follows ground delta through scrub/step and preserves manual camera offsets and lens', () => {
    const { playback, follow, camera, target } = rig()
    playback.seek(1); follow.update()
    expect(camera.position.toArray()).toEqual([15, 8, 12]); expect(target.toArray()).toEqual([10, 0, 0])
    camera.position.add(new Vector3(2, 3, 4)); target.add(new Vector3(-1, 2, 1)); camera.zoom = 1.25
    const offset = camera.position.clone().sub(target)
    playback.step(1); follow.update()
    expect(camera.position.clone().sub(target).distanceTo(offset)).toBeLessThan(1e-12)
    expect(camera.position.y).toBe(11); expect(target.y).toBe(2); expect(camera.zoom).toBe(1.25)
    playback.seek(.2); follow.update(); expect(camera.position.x).toBeCloseTo(9)
    follow.setMode('off'); playback.seek(1); follow.update(); expect(camera.position.x).toBeCloseTo(9)
  })
  it('supports reference-only resynchronization without moving the camera', () => {
    const { playback, follow, camera } = rig()
    playback.seek(1.9); follow.update(); playback.playing = true
    const before = camera.position.clone()
    follow.update(playback.advance(4.2))
    expect(camera.position.equals(before)).toBe(true)
    follow.update(playback.advance(.1)); expect(camera.position.x).toBeCloseTo(before.x + 1)
    // Fit or user changes establish a new camera position without changing next delta.
    camera.position.set(100, 200, 300); follow.reset(); playback.seek(.3); follow.update()
    expect(camera.position.x).toBeCloseTo(101)
  })
  it('supports future 3D follow and independent export snapshots', () => {
    const { playback, follow, camera } = rig(); follow.setMode('3d')
    const snapshot = follow.snapshot(); playback.seek(1); follow.update(); expect(camera.position.y).toBe(10.5)
    follow.restore(snapshot); expect(follow.snapshot().previous?.toArray()).toEqual([0, 0, 0])
  })
  it('keeps X-Ray separate from Bones visibility', () => {
    const { root } = rig(); const asset = new AssetInstance(root, new File(['x'], 'rig.fbx'), [])
    asset.helper.visible = false; asset.setXRay(true)
    expect(asset.helper.visible).toBe(false); expect(asset.helper.renderOrder).toBe(1000)
    const material = Array.isArray(asset.helper.material) ? asset.helper.material[0] : asset.helper.material
    expect(material.depthTest).toBe(false)
    asset.setXRay(false); expect(material.depthTest).toBe(true); expect(asset.helper.visible).toBe(false)
    asset.dispose()
  })
  it('scales/recenters shadows without moving the FBX or following jumps vertically', () => {
    const scene = new Scene(), light = new DirectionalLight(), root = new Group(), mesh = new Mesh()
    root.position.set(10, 20, 30); root.add(mesh); root.updateMatrixWorld(true)
    const original = root.matrixWorld.clone()
    const ground = new GroundShadow(scene, light)
    ground.configure(root, new Box3(new Vector3(-1, 0, -1), new Vector3(1, 4, 1)), new Vector3())
    ground.setEnabled(true); const y = ground.plane.position.y, extent = light.shadow.camera.right
    ground.update(new Vector3(100, 50, -200))
    expect(ground.plane.position.toArray()).toEqual([100, y, -200])
    expect(light.shadow.camera.right).toBe(extent); expect(root.matrixWorld.equals(original)).toBe(true)
    expect(mesh.castShadow).toBe(true); expect(ground.plane.visible).toBe(true)
    ground.setEnabled(false); expect(ground.plane.visible).toBe(false); expect(light.castShadow).toBe(false)
    ground.dispose()
  })
})
