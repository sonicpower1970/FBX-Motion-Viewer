import { Matrix4, PerspectiveCamera } from 'three'
import { guideSize } from '../utils/frameGuide'

/** Apply a centered gate crop to the actual viewer projection, including zoom,
 * film offset and view offsets. The input is an export-only clone, never the viewer.
 * Call after any Fit: updateProjectionMatrix() would replace this cropped matrix.
 */
export function applyExportProjection(camera: PerspectiveCamera, aspect: number, cropToGate: boolean) {
  if (!cropToGate) return // Preserve full-viewport frustum, including AVC even-pixel rounding.
  const sourceAspect = camera.aspect
  const gate = guideSize(sourceAspect, 1, aspect)
  const crop = new Matrix4().makeScale(sourceAspect / gate.width, 1 / gate.height, 1)
  camera.projectionMatrix.premultiply(crop)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  camera.aspect = aspect
  // fov and zoom remain the user's lens settings; the projection carries the crop.
}

export function exportCamera(viewer: PerspectiveCamera, aspect: number, cropToGate: boolean) {
  const camera = viewer.clone()
  applyExportProjection(camera, aspect, cropToGate)
  return camera
}
