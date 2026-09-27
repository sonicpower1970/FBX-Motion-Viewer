import { guideSize } from '../utils/frameGuide'
import { Bone, Box3, MathUtils, Mesh, MOUSE, PerspectiveCamera, SkinnedMesh, Vector3 } from 'three'
import type { Object3D } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function assetBounds(root: Object3D) {
  root.updateMatrixWorld(true)
  const bounds = new Box3()
  const point = new Vector3()
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) object.skeleton.update()
    if (object instanceof Bone) bounds.expandByPoint(object.getWorldPosition(point))
    if (object instanceof Mesh) {
      // Precise posed vertices are evaluated only on Fit, not every render frame.
      const position = object.geometry.getAttribute('position')
      if (position) {
        for (let i = 0; i < position.count; i++) {
          object.getVertexPosition(i, point).applyMatrix4(object.matrixWorld)
          if ([point.x, point.y, point.z].every(Number.isFinite)) bounds.expandByPoint(point)
        }
      }
    }
  })
  return bounds
}

export class CameraController {
  readonly controls: OrbitControls
  private readonly gate = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && !event.altKey) event.stopImmediatePropagation()
  }
  private readonly menu = (event: Event) => event.preventDefault()

  constructor(readonly camera: PerspectiveCamera, private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.gate, true)
    canvas.addEventListener('contextmenu', this.menu)
    this.controls = new OrbitControls(camera, canvas)
    this.controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.DOLLY }
    this.controls.enableDamping = false
    this.controls.zoomToCursor = false
    this.controls.target.set(0, 80, 0)
    this.controls.update()
  }

  fit(root: Object3D, guideAspect?: number) {
    const radius = fitCamera(this.camera, this.controls.target, root, guideAspect)
    if (radius === false) return false
    this.controls.minDistance = radius * 0.01
    this.controls.maxDistance = radius * 100
    this.controls.update()
    return true
  }

  dispose() {
    this.controls.dispose()
    this.canvas.removeEventListener('pointerdown', this.gate, true)
    this.canvas.removeEventListener('contextmenu', this.menu)
  }
}

export function fitCamera(camera: PerspectiveCamera, target: Vector3, root: Object3D, guideAspect?: number) {
  const bounds = assetBounds(root)
  if (bounds.isEmpty()) return false
  const center = bounds.getCenter(new Vector3())
  const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.01)
  const gateHeight = guideAspect ? guideSize(camera.aspect, 1, guideAspect).height : 1
  const vertical = Math.atan(Math.tan(MathUtils.degToRad(camera.getEffectiveFOV() / 2)) * gateHeight)
  const horizontal = Math.atan(Math.tan(vertical) * (guideAspect ?? camera.aspect))
  const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.15
  const direction = camera.position.clone().sub(target).normalize()
  if (direction.lengthSq() === 0) direction.set(1, 0.6, 1).normalize()
  target.copy(center)
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.near = Math.max(radius / 10000, 0.00001)
  camera.far = Math.max(distance + radius * 100, 100)
  camera.updateProjectionMatrix()
  camera.lookAt(target)
  camera.updateMatrixWorld(true)
  return radius
}
