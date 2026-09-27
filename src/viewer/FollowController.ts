import { Bone, Mesh, Object3D, PropertyBinding, Vector3 } from 'three'
import type { AnimationClip, PerspectiveCamera } from 'three'

export type FollowMode = 'off' | 'ground' | '3d'

// Follow a stable scene node, never a changing posed bounding-box center.
// Prefer the largest skeleton and its highest bone with translation animation.
export function findFollowTarget(root: Object3D, clip?: AnimationClip): Object3D {
  const bones: Bone[] = []
  root.traverse(node => { if (node instanceof Bone) bones.push(node) })
  const moving = new Set<Object3D>()
  for (const track of clip?.tracks ?? []) {
    const parsed = PropertyBinding.parseTrackName(track.name)
    if (parsed.propertyName !== 'position') continue
    const width = track.getValueSize()
    if (!track.values.some((value, i) => Math.abs(value - track.values[i % width]) > 1e-7)) continue
    const node = PropertyBinding.findNode(root, parsed.nodeName)
    if (node instanceof Object3D) moving.add(node)
  }
  if (bones.length) {
    const roots = bones.filter(bone => {
      for (let p = bone.parent; p && p !== root; p = p.parent) if (p instanceof Bone) return false
      return true
    })
    const count = (node: Object3D) => { let n = 0; node.traverse(child => { if (child instanceof Bone) n++ }); return n }
    const primary = roots.sort((a, b) => count(b) - count(a))[0] ?? bones[0]
    const queue: Object3D[] = [primary]
    while (queue.length) {
      const node = queue.shift()!
      if (node instanceof Bone && moving.has(node)) return node
      queue.push(...node.children)
    }
    return primary
  }
  // Mesh-only rigid motion: the first animated transform, then first mesh.
  if (moving.size) return moving.values().next().value!
  let mesh: Object3D | undefined
  root.traverse(node => { if (!mesh && node instanceof Mesh) mesh = node })
  return mesh ?? root
}

export class FollowController {
  mode: FollowMode = 'off'
  target: Object3D | null = null
  private previous: Vector3 | null = null
  constructor(private readonly camera: PerspectiveCamera, private readonly orbitTarget: Vector3) {}

  position() { return this.target?.getWorldPosition(new Vector3()) ?? new Vector3() }
  private valid(position: Vector3) { return position.toArray().every(Number.isFinite) }
  resetFollowReferenceWithoutMovingCamera() {
    const position = this.target ? this.position() : null
    this.previous = position && this.valid(position) ? position : null
  }
  reset() { this.resetFollowReferenceWithoutMovingCamera() }
  attach(target: Object3D) { this.target = target; this.reset() }
  setMode(mode: FollowMode) { this.mode = mode; this.reset() }
  private translate(delta: Vector3, groundOnly = true) {
    if (groundOnly && this.mode === 'ground') delta.addScaledVector(this.camera.up, -delta.dot(this.camera.up) / this.camera.up.lengthSq())
    const cameraPosition = this.camera.position.clone().add(delta)
    const targetPosition = this.orbitTarget.clone().add(delta)
    if (!this.valid(delta) || !this.valid(cameraPosition) || !this.valid(targetPosition)) return
    this.camera.position.copy(cameraPosition)
    this.orbitTarget.copy(targetPosition)
    this.camera.updateMatrixWorld(true)
  }
  /** Evaluate START first. Rebase the camera/target together, without Fit or lens changes.
   * Uses the last actually evaluated root position, not a presumed exact END sample.
   */
  rebaseLoopPreservingComposition() {
    const start = this.position()
    if (this.target && this.valid(start) && this.previous && this.mode !== 'off') {
      this.translate(start.clone().sub(this.previous))
    }
    this.resetFollowReferenceWithoutMovingCamera()
  }
  /** Transfer the inspected subject-relative composition to START for export.
   * Initial relocation includes Y; subsequent ground Follow still ignores Y motion.
   */
  rebaseExportFrom(inspectedPosition: Vector3) {
    const start = this.position()
    if (this.target && this.mode !== 'off' && this.valid(start) && this.valid(inspectedPosition)) {
      this.translate(start.clone().sub(inspectedPosition), false)
    }
    this.resetFollowReferenceWithoutMovingCamera()
  }
  update(discontinuity = false) {
    if (!this.target) return
    const current = this.position()
    if (!this.valid(current)) { this.previous = null; return }
    if (this.mode !== 'off' && this.previous && !discontinuity) this.translate(current.clone().sub(this.previous))
    this.previous = current
  }
  snapshot() { return { mode: this.mode, target: this.target, previous: this.previous?.clone() ?? null } }
  restore(saved: ReturnType<FollowController['snapshot']>) {
    this.mode = saved.mode; this.target = saved.target; this.previous = saved.previous?.clone() ?? null
  }
}
