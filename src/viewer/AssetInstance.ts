import { Bone, Color, Mesh, SkeletonHelper, SkinnedMesh } from 'three'
import type { Group } from 'three'
import type { AssetInfo } from '../types/viewer'
import { PlaybackController } from './PlaybackController'
import { disposeAsset } from './disposeAsset'
import { BACKGROUND_THEMES } from './backgroundTheme'
import type { BackgroundMode } from './backgroundTheme'

export class AssetInstance {
  readonly playback: PlaybackController
  readonly helper: SkeletonHelper
  readonly info: AssetInfo
  constructor(readonly root: Group, file: File, warnings: string[]) {
    let meshes = 0
    let bones = 0
    root.traverse((object) => {
      if (object instanceof Mesh) meshes++
      // Animated bounds can leave their bind-pose sphere. Avoid incorrect culling
      // without recomputing all deformed vertices on every playback tick.
      if (object instanceof SkinnedMesh) object.frustumCulled = false
      if (object instanceof Bone) bones++
    })
    this.helper = new SkeletonHelper(root)
    this.helper.setColors(new Color('#ffe0a3'), new Color('#dd9745'))
    // v0.1: regular depth-tested bones. X-ray is reserved for v0.2.
    const helperMaterials = Array.isArray(this.helper.material) ? this.helper.material : [this.helper.material]
    helperMaterials.forEach((material) => { material.depthTest = true })
    this.helper.frustumCulled = false
    this.playback = new PlaybackController(root)
    this.playback.select(root.animations[0])
    this.info = {
      name: file.name, size: file.size, meshes, bones, warnings,
      clips: root.animations.map((clip, index) => ({ name: clip.name || `Take ${index + 1}`, duration: clip.duration })),
    }
    if (!meshes && !bones) this.info.warnings.push('No mesh or skeleton was found in this FBX.')
    if (!root.animations.length) this.info.warnings.push('No animation clips found. Displaying the static pose.')
  }
  setXRay(enabled: boolean) {
    const materials = Array.isArray(this.helper.material) ? this.helper.material : [this.helper.material]
    materials.forEach(material => { material.depthTest = !enabled; material.depthWrite = false })
    this.helper.renderOrder = enabled ? 1000 : 0
  }
  setBackground(mode: BackgroundMode) {
    const theme = BACKGROUND_THEMES[mode]
    this.helper.setColors(new Color(theme.boneStart), new Color(theme.boneEnd))
  }
  setMeshVisible(visible: boolean) {
    // Layers hide only renderable meshes, not descendant bones or other objects.
    this.root.traverse((object) => { if (object instanceof Mesh) object.layers.set(visible ? 0 : 1) })
  }
  dispose() {
    this.playback.dispose()
    this.helper.dispose()
    disposeAsset(this.root)
    this.root.removeFromParent()
    this.helper.removeFromParent()
  }
}
