import type { FrameGuideMode } from '../utils/frameGuide'
import type { BackgroundMode } from '../viewer/backgroundTheme'

export interface ClipInfo { name: string; duration: number }
export interface AssetInfo {
  name: string
  size: number
  meshes: number
  bones: number
  clips: ClipInfo[]
  frameRate?: import('../viewer/fbxFrameRate').FbxFrameRate
  warnings: string[]
}
export interface ViewerSnapshot {
  asset: AssetInfo | null
  loading: boolean
  pendingName: string
  error: string | null
  time: number
  duration: number
  playing: boolean
  loop: boolean
  speed: number
  xray: boolean
  shadow: boolean
  fitEnabled: boolean
  follow: boolean
  exporting: boolean
  capturing: boolean
  background: BackgroundMode
  exportProgress: number
  frameGuide: FrameGuideMode
  burnIn: boolean
  exportStatus: string
  clipIndex: number
  fps: number
  startFrame: number
  renderFps: number
  meshVisible: boolean
  boneVisible: boolean
  gridVisible: boolean
}
export const INITIAL_SNAPSHOT: ViewerSnapshot = {
  asset: null, loading: false, pendingName: '', error: null,
  time: 0, duration: 0, playing: false, loop: true, clipIndex: -1,
  fps: 30, startFrame: 0, renderFps: 0,
  speed: 1, xray: false, shadow: false, fitEnabled: true, follow: false,
  frameGuide: 'off', burnIn: false, background: 'dark', capturing: false,
  exporting: false, exportProgress: 0, exportStatus: '',
  meshVisible: true, boneVisible: true, gridVisible: true,
}
