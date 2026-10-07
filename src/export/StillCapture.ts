import { burnInBasename } from '../overlay/BurnInRenderer'
import type { BurnInData } from '../overlay/BurnInRenderer'
import { displayFrame, endFrame, formatFrame } from '../utils/frameTime'
import type { FrameGuideMode } from '../utils/frameGuide'
import type { VideoDestination, VideoFileHandle } from './saveExportedVideo'

export function captureFileName(data: BurnInData, animated: boolean) {
  const base = burnInBasename(data.name).replace(/\.fbx$/i, '')
    .split('').map(char => char.charCodeAt(0) < 32 || /[:*?"<>|]/.test(char) ? '_' : char).join('').replace(/[. ]+$/, '') || 'capture'
  const frame = animated ? `_f${formatFrame(displayFrame(data.time, data.duration, data.fps, data.startFrame),
    endFrame(data.duration, data.fps, data.startFrame))}` : ''
  return `${base}${frame}.png`
}

export function captureSize(mode: FrameGuideMode, width: number, height: number) {
  // CSS viewport pixels avoid multiplying Retina output by devicePixelRatio.
  return mode === 'off' ? { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
    : { width: 1920, height: 1080 }
}

// Invoke before any awaits so the native picker retains click activation.
export async function chooseImageDestination(name: string): Promise<VideoDestination> {
  const browser = window as Window & { showSaveFilePicker?: (options: {
    suggestedName: string; types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<VideoFileHandle> }
  if (typeof browser.showSaveFilePicker !== 'function') return { name }
  return { name, handle: await browser.showSaveFilePicker({ suggestedName: name,
    types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
  }) }
}

export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode PNG.')), 'image/png')
  })
}
