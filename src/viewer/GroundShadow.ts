import { Box3, DirectionalLight, DoubleSide, Mesh, PlaneGeometry, Scene, ShadowMaterial, Vector3 } from 'three'
import type { Object3D } from 'three'

export class GroundShadow {
  readonly plane = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.32, depthWrite: false }))
  private anchor = new Vector3()
  private center = new Vector3()
  private floor = 0
  private radius = 1
  private enabled = false
  private ready = false
  constructor(private readonly scene: Scene, private readonly light: DirectionalLight) {
    this.plane.rotation.x = -Math.PI / 2 // The Viewer uses Y-up.
    this.plane.receiveShadow = true
    this.plane.visible = false
    this.plane.renderOrder = -1
    light.shadow.mapSize.set(2048, 2048)
    scene.add(this.plane, light.target)
  }
  configure(root: Object3D, bounds: Box3, anchor: Vector3) {
    this.ready = !bounds.isEmpty()
    root.traverse(node => {
      if (node instanceof Mesh) {
        node.castShadow = true
        // Thin/single-sided FBX surfaces must also cast a shadow.
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.shadowSide = DoubleSide
      }
    })
    if (!this.ready) { this.setEnabled(this.enabled); return }
    this.anchor.copy(anchor)
    bounds.getCenter(this.center)
    const size = bounds.getSize(new Vector3())
    this.radius = Math.max(size.length(), 0.1) * 1.5
    this.floor = bounds.min.y - this.radius * 0.001
    this.plane.scale.setScalar(this.radius * 4)
    const camera = this.light.shadow.camera
    camera.left = camera.bottom = -this.radius
    camera.right = camera.top = this.radius
    camera.near = this.radius * 0.01
    camera.far = this.radius * 8
    camera.updateProjectionMatrix()
    this.light.shadow.normalBias = this.radius * 0.0005
    this.light.shadow.bias = -0.00005
    this.update(anchor)
    this.setEnabled(this.enabled)
  }
  update(anchor: Vector3) {
    if (!this.ready) return
    const center = this.center.clone().add(anchor.clone().sub(this.anchor).setY(0))
    this.plane.position.set(center.x, this.floor, center.z)
    this.light.target.position.copy(center)
    this.light.position.copy(center).add(new Vector3(1.5, 3, 2).multiplyScalar(this.radius))
    this.light.target.updateMatrixWorld(true)
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled
    this.plane.visible = enabled && this.ready
    this.light.castShadow = enabled && this.ready
  }
  dispose() {
    this.scene.remove(this.plane, this.light.target)
    this.plane.geometry.dispose(); this.plane.material.dispose()
    this.light.shadow.map?.dispose()
    this.light.shadow.mapPass?.dispose()
  }
}
