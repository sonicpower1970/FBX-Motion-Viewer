import { expect, test } from 'vitest'
import { Bone, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshPhongMaterial, Scene } from 'three'
import { AssetInstance } from '../../src/viewer/AssetInstance'
import { InfiniteGrid } from '../../src/viewer/InfiniteGrid'
import { GroundShadow } from '../../src/viewer/GroundShadow'
import { BACKGROUND_THEMES } from '../../src/viewer/backgroundTheme'

test('background palette changes only display helpers, preserving material and rig state', () => {
  const root = new Group(), bone = new Bone(), child = new Bone()
  child.position.y = 10; bone.add(child); root.add(bone)
  const material = new MeshPhongMaterial({ color: '#ffffff', shininess: 70 })
  const mesh = new Mesh(new BoxGeometry(), material); root.add(mesh)
  root.updateMatrixWorld(true)
  const asset = new AssetInstance(root, new File([], 'static.fbx'), [])
  const grid = new InfiniteGrid(), ground = new GroundShadow(new Scene(), new DirectionalLight())
  const original = { material: material.toJSON(), transform: root.matrixWorld.toArray(), bone: child.position.toArray() }
  asset.setXRay(true); asset.helper.visible = false
  for (const mode of ['light', 'dark'] as const) {
    asset.setBackground(mode); grid.setBackground(mode)
    expect(material.toJSON()).toEqual(original.material)
    expect(root.matrixWorld.toArray()).toEqual(original.transform)
    expect(child.position.toArray()).toEqual(original.bone)
    expect(asset.helper.visible).toBe(false)
    expect(asset.helper.renderOrder).toBe(1000)
    const lineMaterial = Array.isArray(asset.helper.material) ? asset.helper.material[0] : asset.helper.material
    expect(lineMaterial.depthTest).toBe(false)
    expect(grid.material.uniforms.minorColor.value).toEqual(new Color(BACKGROUND_THEMES[mode].gridMinor))
    expect(Array.from(asset.helper.geometry.getAttribute('color').array).slice(0,3)).toEqual(
      new Color(BACKGROUND_THEMES[mode].boneStart).toArray().map(Math.fround))
  }
  expect(ground.plane.material.opacity).toBe(BACKGROUND_THEMES.light.shadowOpacity)
  grid.dispose(); ground.dispose(); asset.dispose()
})
