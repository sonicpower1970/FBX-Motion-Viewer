import { endFrame } from './frameTime'
export type ExportResolution = '720p' | '1080p' | 'viewport'
// Include the exact last pose, with one output-frame hold. No duplicated loop start.
export function exportTiming(duration: number, fps: number) {
  if (!(duration > 0) || !Number.isFinite(duration) || !(fps > 0) || !Number.isFinite(fps)) throw new Error('Choose an animated take and a valid Timeline FPS.')
  const count = endFrame(duration, fps) + 1
  return { count, duration: count / fps, sample: (index: number) => ({ time: Math.min(index / fps, duration), timestamp: index / fps, duration: 1 / fps }) }
}
export function exportSize(resolution: ExportResolution, width: number, height: number) {
  if (resolution === '720p') return { width: 1280, height: 720 }
  if (resolution === '1080p') return { width: 1920, height: 1080 }
  // AVC needs even dimensions. Preserve the rendered viewport size to within 1px.
  return { width: Math.max(2, Math.floor(width / 2) * 2), height: Math.max(2, Math.floor(height / 2) * 2) }
}
