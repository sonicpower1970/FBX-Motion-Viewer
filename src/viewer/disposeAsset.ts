import { Mesh, Texture, SkinnedMesh } from 'three'
import type { Object3D, Material } from 'three'

export function materialTextures(material: Material): Texture[] {
  return Object.values(material).filter((value): value is Texture => value instanceof Texture)
}

export function disposeAsset(root: Object3D) {
  const geometries = new Set<Mesh['geometry']>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const skeletons = new Set<SkinnedMesh['skeleton']>()
  root.traverse((object) => {
    if (object instanceof Mesh) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material)
        materialTextures(material).forEach((texture) => textures.add(texture))
      }
      if (object instanceof SkinnedMesh) skeletons.add(object.skeleton)
    }
  })
  skeletons.forEach((skeleton) => skeleton.dispose())
  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
  geometries.forEach((geometry) => geometry.dispose())
}
