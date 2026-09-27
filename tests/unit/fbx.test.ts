import { describe, expect, it } from 'vitest'
import { Mesh, SkinnedMesh, Vector3 } from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { makeFbx } from '../fixtures/fbx'
import { AssetInstance } from '../../src/viewer/AssetInstance'
import { assetBounds } from '../../src/viewer/CameraController'
import { validateFile, MAX_FILE_BYTES } from '../../src/viewer/FbxAssetLoader'
import { MISSING_TEXTURE, resolveTexture } from '../../src/viewer/texturePolicy'

function parse(mesh: boolean, animated = true) {
  const loader = new FBXLoader()
  loader.trimAnimationClips = true
  return loader.parse(new TextEncoder().encode(makeFbx({ mesh, animated })).buffer, '')
}
describe('real FBX parsing', () => {
  it('loads a skeleton with two takes and normalizes a nonzero take start', () => {
    const root = parse(false)
    const asset = new AssetInstance(root, new File(['test'], 'skeleton.fbx'), [])
    expect(asset.info.bones).toBe(3)
    expect(asset.info.meshes).toBe(0)
    expect(asset.info.clips.map((clip) => clip.name)).toEqual(['Travel', 'Return'])
    expect(asset.info.clips.map((clip) => clip.duration)).toEqual([2, 1])
    asset.playback.select(root.animations[1])
    asset.playback.seek(0.5)
    expect(root.getObjectByName('Root')!.position.x).toBeCloseTo(-40)
    expect(assetBounds(root).isEmpty()).toBe(false)
    asset.dispose()
  })
  it('loads actual skinned geometry and evaluates deformed vertices', () => {
    const root = parse(true)
    const asset = new AssetInstance(root, new File(['test'], 'skin.fbx'), [])
    const mesh = root.getObjectByName('SkinnedRibbon') as SkinnedMesh
    expect(mesh.isSkinnedMesh).toBe(true)
    const before = mesh.getVertexPosition(0, new Vector3()).clone()
    asset.playback.seek(1)
    mesh.skeleton.update()
    expect(mesh.getVertexPosition(0, new Vector3()).x - before.x).toBeCloseTo(80)
    const transform = root.matrix.clone()
    const bounds = assetBounds(root)
    expect(bounds.min.x).toBeCloseTo(55)
    expect(root.matrix.equals(transform)).toBe(true)
    asset.setMeshVisible(false)
    root.traverse((object) => { if (object instanceof Mesh) expect(object.layers.mask).toBe(2) })
    expect(asset.helper.visible).toBe(true)
    asset.playback.seek(0)
    expect(assetBounds(root).min.x).toBeCloseTo(-25)
    asset.dispose()
  })
  it('loads static skeletons without an animation controller action', () => {
    const root = parse(false, false)
    const asset = new AssetInstance(root, new File(['test'], 'static.fbx'), [])
    expect(asset.playback.duration).toBe(0)
    asset.playback.toggle()
    expect(asset.playback.playing).toBe(false)
    expect(asset.info.warnings.join()).toContain('No animation')
    asset.dispose()
  })
})
describe('local file boundary', () => {
  it.each(['https://example.com/private.png', '//example.com/file.jpg', 'C:\\textures\\skin.png', '../../file.png', 'file:///tmp/map.jpg', 'data:image/svg+xml,<svg/>'])('blocks %s', (url) => {
    const warnings: string[] = []
    expect(resolveTexture(url, (message) => warnings.push(message))).toBe(MISSING_TEXTURE)
    expect(warnings).toHaveLength(1)
  })
  it('allows embedded images', () => {
    expect(resolveTexture(MISSING_TEXTURE, () => {})).toBe(MISSING_TEXTURE)
    expect(resolveTexture('blob:http://localhost:5173/uuid', () => {})).toBe('blob:http://localhost:5173/uuid')
  })
  it('validates files before allocating a parse buffer', () => {
    expect(() => validateFile({ name: 'scene.fbx', size: MAX_FILE_BYTES })).not.toThrow()
    expect(() => validateFile({ name: 'scene.fbx', size: MAX_FILE_BYTES + 1 })).toThrow('500 MiB')
    expect(() => validateFile({ name: 'scene.fbx', size: 0 })).toThrow('empty')
    expect(() => validateFile({ name: 'scene.exe', size: 100 })).toThrow('.fbx')
  })
})
