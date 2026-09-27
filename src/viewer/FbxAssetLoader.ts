import { readFbxFrameRate } from './fbxFrameRate'
import type { FbxFrameRate } from './fbxFrameRate'
import { LoadingManager, Mesh, MeshStandardMaterial } from 'three'
import type { Group, Material } from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { disposeAsset, materialTextures } from './disposeAsset'
import { requiresLegacyReader } from './fbxVersion'
import { loadLegacyFbx } from './legacy/loadLegacyFbx'
import { MISSING_TEXTURE, resolveTexture } from './texturePolicy'

export const MAX_FILE_BYTES = 500 * 1024 * 1024

export function validateFile(file: Pick<File, 'name' | 'size'>) {
  if (!/\.fbx$/i.test(file.name)) throw new Error('Choose an .fbx file.')
  if (file.size === 0) throw new Error('This FBX file is empty.')
  if (file.size > MAX_FILE_BYTES) throw new Error('This file exceeds the 500 MiB limit.')
}

export async function loadFbx(file: File, signal?: AbortSignal): Promise<{ root: Group; warnings: string[]; frameRate: FbxFrameRate }> {
  validateFile(file)
  const buffer = await file.arrayBuffer()
  signal?.throwIfAborted()
  const frameRate = readFbxFrameRate(buffer)
  if (requiresLegacyReader(buffer)) {
    try { return { ...await loadLegacyFbx(buffer, signal), frameRate } }
    catch (error) {
      if (signal?.aborted) throw error
      throw new Error(`Could not read this FBX. ${error instanceof Error ? error.message : 'Legacy conversion failed.'}`, { cause: error })
    }
  }
  const warnings = new Set<string>()
  const objectUrls = new Set<string>()
  const manager = new LoadingManager()
  manager.setURLModifier((url) => {
    const resolved = resolveTexture(url, (warning) => warnings.add(warning))
    if (resolved.startsWith('blob:')) objectUrls.add(resolved)
    return resolved
  })
  manager.onError = () => warnings.add('A texture could not be decoded. Using a neutral material.')
  const ready = new Promise<void>((resolve) => { manager.onLoad = resolve })
  // Keep the manager open while parse discovers embedded images.
  manager.itemStart('fbx-parse')
  let root: Group | undefined
  try {
    const loader = new FBXLoader(manager)
    loader.trimAnimationClips = true
    root = loader.parse(buffer, '')
    manager.itemEnd('fbx-parse')
    await ready
    const replaced = new Set<Material>()
    const materialCache = new Map<Material, Material>()
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const fallback = (material: Material) => {
        const previous = materialCache.get(material)
        if (previous) return previous
        const bad = materialTextures(material).some((texture) => {
          const img = texture.image as HTMLImageElement | undefined
          return !img || img.src === MISSING_TEXTURE || ('naturalWidth' in img && img.naturalWidth === 0)
        })
        if (!bad) return material
        warnings.add('Missing or unsupported textures were replaced with a neutral material.')
        const replacement = new MeshStandardMaterial({ color: 0x9ca9b7, roughness: 0.8, side: material.side })
        materialCache.set(material, replacement)
        replaced.add(material)
        return replacement
      }
      object.material = Array.isArray(object.material) ? object.material.map(fallback) : fallback(object.material)
    })
    // Dispose only textures no longer referenced by retained materials.
    const retained = new Set()
    root.traverse((object) => {
      if (object instanceof Mesh) {
        const list = Array.isArray(object.material) ? object.material : [object.material]
        list.forEach((material) => materialTextures(material).forEach((texture) => retained.add(texture)))
      }
    })
    replaced.forEach((material) => {
      materialTextures(material).forEach((texture) => { if (!retained.has(texture)) texture.dispose() })
      material.dispose()
    })
    return { root, warnings: [...warnings], frameRate }
  } catch (error) {
    if (root) disposeAsset(root)
    throw new Error(`Could not read this FBX. ${error instanceof Error ? error.message : 'Unsupported or damaged file.'}`, { cause: error })
  } finally {
    objectUrls.forEach((url) => URL.revokeObjectURL(url))
  }
}
