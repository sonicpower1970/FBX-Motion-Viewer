import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { SkinnedMesh, Vector3 } from 'three'
import createUfbx from '../../src/viewer/legacy/generated/ufbx.js'
import { buildLegacyScene } from '../../src/viewer/legacy/buildLegacyScene'
import { PlaybackController } from '../../src/viewer/PlaybackController'
import { disposeAsset } from '../../src/viewer/disposeAsset'
import { makeFbx } from '../fixtures/fbx'

async function parse(bytes: Uint8Array) {
  const module = await createUfbx({ wasmBinary: await readFile('src/viewer/legacy/generated/ufbx.wasm') })
  const ptr = module._malloc(bytes.byteLength)
  module.HEAPU8.set(bytes, ptr)
  try {
    if (!module._convert(ptr, bytes.byteLength)) throw new Error(module.error)
    return module.result
  } finally { module._free(ptr) }
}
describe('ufbx WASM bridge', () => {
  it('rejects damaged input without partial scene output', async () => {
    await expect(parse(new TextEncoder().encode('not an FBX'))).rejects.toThrow()
  })
  it('preserves known skinned vertex motion and nonzero take start times', async () => {
    const data = await parse(new TextEncoder().encode(makeFbx({ mesh: true })))
    const { root } = await buildLegacyScene(data)
    const playback = new PlaybackController(root)
    let mesh!: SkinnedMesh
    root.traverse(o => { if (o instanceof SkinnedMesh) mesh = o })
    expect(mesh).toBeDefined()
    expect(root.animations.map(c => c.duration)).toEqual([2, 1])
    playback.select(root.animations[0]); playback.seek(1)
    expect(mesh.localToWorld(mesh.getVertexPosition(0, new Vector3())).x).toBeCloseTo(55, 3)
    playback.select(root.animations[1]); playback.seek(0.5)
    expect(mesh.localToWorld(mesh.getVertexPosition(0, new Vector3())).x).toBeCloseTo(-65, 3)
    playback.dispose(); disposeAsset(root)
  })
  it('reads actual legacy ASCII mesh/skin/takes with finite animated vertices', async () => {
    const data = await parse(await readFile('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx'))
    expect(data.meshes.length).toBeGreaterThan(0)
    expect(data.meshes[0].bones.length).toBeGreaterThan(1)
    expect(data.clips.length).toBeGreaterThan(0)
    const { root } = await buildLegacyScene(data)
    const playback = new PlaybackController(root)
    let mesh!: SkinnedMesh
    root.traverse(o => { if (o instanceof SkinnedMesh) mesh = o })
    for (const clip of root.animations) {
      playback.select(clip)
      for (const t of [0, clip.duration * .3, clip.duration]) {
        playback.seek(t)
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          const pos = mesh.localToWorld(mesh.getVertexPosition(i, new Vector3()))
          expect(pos.toArray().every(Number.isFinite)).toBe(true)
        }
      }
    }
    playback.dispose(); disposeAsset(root)
  })
})

it('matches Maya reference skinned positions at source frame 10', async () => {
  const data = await parse(await readFile('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx'))
  const { root } = await buildLegacyScene(data)
  const reference = (await readFile('tests/fixtures/legacy/maya_game_sausage_wiggle_10.obj', 'utf8'))
    .split('\n').filter(line => line.startsWith('v ')).map(line => new Vector3(...line.trim().split(/\s+/).slice(1).map(Number) as [number, number, number]))
  const playback = new PlaybackController(root)
  playback.select(root.animations.find(c => c.name === 'wiggle'))
  // This take starts at source frame 1 at 24fps, normalized to viewer time zero.
  playback.seek(9 / 24)
  const actual: Vector3[] = []
  root.traverse(o => {
    if (o instanceof SkinnedMesh) for (let i = 0; i < o.geometry.attributes.position.count; i++) actual.push(o.localToWorld(o.getVertexPosition(i, new Vector3())))
  })
  expect(actual.length).toBeGreaterThan(0)
  for (const vertex of actual) expect(Math.min(...reference.map(p => p.distanceTo(vertex)))).toBeLessThan(0.0001)
  for (const vertex of reference) expect(Math.min(...actual.map(p => p.distanceTo(vertex)))).toBeLessThan(0.0001)
  playback.dispose(); disposeAsset(root)
})
