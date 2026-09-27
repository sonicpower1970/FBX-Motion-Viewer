import {
  AnimationClip, Bone, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Matrix3, Matrix4,
  Mesh, MeshStandardMaterial, QuaternionKeyframeTrack, RepeatWrapping, Skeleton, SkinnedMesh,
  SRGBColorSpace, TextureLoader, VectorKeyframeTrack,
} from 'three'
import { disposeAsset } from '../disposeAsset'
import type { LegacyScene } from './types'

function matrix(values: ArrayLike<number>, offset = 0) {
  return new Matrix4().set(
    values[offset], values[offset + 3], values[offset + 6], values[offset + 9],
    values[offset + 1], values[offset + 4], values[offset + 7], values[offset + 10],
    values[offset + 2], values[offset + 5], values[offset + 8], values[offset + 11], 0, 0, 0, 1,
  )
}
// Inspect bytes, never turn the source FBX filename into a browser URL.
function imageType(data: Uint8Array) {
  if (data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) return 'image/png'
  if (data[0] === 255 && data[1] === 216) return 'image/jpeg'
  if (data[0] === 71 && data[1] === 73 && data[2] === 70) return 'image/gif'
  if (data[0] === 66 && data[1] === 77) return 'image/bmp'
  if (data[0] === 82 && data[1] === 73 && data[8] === 87 && data[9] === 69) return 'image/webp'
  return null
}
export async function buildLegacyScene(data: LegacyScene, signal?: AbortSignal) {
  const root = new Group()
  const warnings = new Set(data.warnings)
  warnings.add('Legacy FBX compatibility reader (ufbx). Transform animation is baked at 120 Hz; verify critical poses against the source application.')
  const materials: MeshStandardMaterial[] = []
  const fallback = new MeshStandardMaterial({ color: 0x9ca9b7, roughness: 0.8, side: DoubleSide })
  const geometries: BufferGeometry[] = []
  try {
    const skinBones = new Set(data.meshes.flatMap((mesh) => [...mesh.bones.slice(0, -1)]))
    const nodes = data.nodes.map((node, id) => {
      const object = node.bone || skinBones.has(id) ? new Bone() : new Group()
      object.name = node.name
      object.position.fromArray(node.trs, 0)
      object.quaternion.fromArray(node.trs, 3)
      object.scale.fromArray(node.trs, 7)
      return object
    })
    data.nodes.forEach((node, id) => { (node.parent < 0 ? root : nodes[node.parent]).add(nodes[id]) })
    for (const source of data.materials) {
      signal?.throwIfAborted()
      const material = new MeshStandardMaterial({ color: new Color().fromArray(source.color), roughness: 0.8, side: DoubleSide })
      material.name = source.name
      materials.push(material)
      if (source.textured) {
        const type = imageType(source.content)
        if (source.content.length && type) {
          const url = URL.createObjectURL(new Blob([source.content], { type }))
          try {
            material.map = await new TextureLoader().loadAsync(url)
            material.map.colorSpace = SRGBColorSpace
            material.map.wrapS = material.map.wrapT = RepeatWrapping
            const m = source.uv
            material.map.matrix = new Matrix3().set(m[0], m[3], m[9], m[1], m[4], m[10], 0, 0, 1)
            material.map.matrixAutoUpdate = false
          } catch { warnings.add('An embedded texture could not be decoded. Using a neutral material.'); material.color.copy(fallback.color) }
          finally { URL.revokeObjectURL(url) }
        } else {
          const name = source.filename.replace(/\\/g, '/').split('/').pop()?.slice(0, 120) || 'unnamed texture'
          warnings.add(`External or unsupported texture unavailable: ${name}. Using a neutral material.`)
          material.color.copy(fallback.color)
        }
      }
    }
    for (const source of data.meshes) {
      signal?.throwIfAborted()
      const geometry = new BufferGeometry()
      geometries.push(geometry)
      geometry.setAttribute('position', new BufferAttribute(source.position, 3))
      geometry.setAttribute('normal', new BufferAttribute(source.normal, 3))
      geometry.setAttribute('uv', new BufferAttribute(source.uv, 2))
      // Compact per-mesh material slots and contiguous triangle groups.
      const slots = new Map<number, number>()
      const meshMaterials: MeshStandardMaterial[] = []
      let start = 0
      for (let i = 0; i < source.materials.length; i++) {
        const id = source.materials[i]
        if (!slots.has(id)) { slots.set(id, slots.size); meshMaterials.push(materials[id] || fallback) }
        if (i === source.materials.length - 1 || source.materials[i + 1] !== id) {
          geometry.addGroup(start * 3, (i + 1 - start) * 3, slots.get(id))
          start = i + 1
        }
      }
      let mesh: Mesh
      if (source.bones.length) {
        // Three.js skinning shaders use vec4; Uint32 attributes bind as integer inputs.
        geometry.setAttribute('skinIndex', new BufferAttribute(new Float32Array(source.skinIndex), 4))
        geometry.setAttribute('skinWeight', new BufferAttribute(source.skinWeight, 4))
        const skinned = new SkinnedMesh(geometry, meshMaterials)
        // Skeleton only needs matrixWorld; the final entry is the mesh's own
        // transform for unweighted vertices, which need not be a visible Bone.
        const bones = Array.from(source.bones, (id) => nodes[id] as Bone)
        const inverses = Array.from(source.bones, (_, i) => matrix(source.inverse, i * 12))
        skinned.bind(new Skeleton(bones, inverses), new Matrix4())
        mesh = skinned
      } else mesh = new Mesh(geometry, meshMaterials)
      mesh.name = data.nodes[source.node].name
      nodes[source.node].add(mesh)
    }
    root.animations = data.clips.map((clip) => new AnimationClip(clip.name, clip.duration, clip.tracks.map((track) => {
      const name = `${nodes[track.node].uuid}.${['position', 'quaternion', 'scale'][track.type]}`
      return track.type === 1 ? new QuaternionKeyframeTrack(name, track.times, track.values) : new VectorKeyframeTrack(name, track.times, track.values)
    })))
    root.updateMatrixWorld(true)
    signal?.throwIfAborted()
    const used = new Set<MeshStandardMaterial>()
    root.traverse((object) => { if (object instanceof Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => used.add(m as MeshStandardMaterial)) })
    for (const material of [...materials, fallback]) if (!used.has(material)) { material.map?.dispose(); material.dispose() }
    return { root, warnings: [...warnings] }
  } catch (error) {
    disposeAsset(root)
    // Also cover resources allocated before attachment to the scene.
    geometries.forEach((geometry) => geometry.dispose())
    for (const material of [...materials, fallback]) { material.map?.dispose(); material.dispose() }
    throw error
  }
}
