import { frameRect } from '../utils/frameGuide'
import { displayFrame, endFrame, formatFrame } from '../utils/frameTime'
import { BACKGROUND_THEMES } from '../viewer/backgroundTheme'
import type { BackgroundMode } from '../viewer/backgroundTheme'

export interface BurnInSettings { filename: boolean; frame: boolean }
export interface BurnInData { name: string; time: number; duration: number; fps: number; startFrame: number }
export const burnInBasename = (name: string) => (name.split(/[\\/]/).pop() ?? '').replace(/[\r\n\t]/g, ' ')
export function frameCounter(data: BurnInData) {
  const end = endFrame(data.duration, data.fps, data.startFrame)
  const current = displayFrame(data.time, data.duration, data.fps, data.startFrame)
  return `${formatFrame(current, end)} / ${formatFrame(end, end)}`
}
const font = (size: number) => `500 ${size}px Arial, sans-serif`

export function fitFilename(context: CanvasRenderingContext2D, name: string, maxWidth: number, size: number, minimum: number) {
  const text = burnInBasename(name)
  context.font = font(size)
  const measured = context.measureText(text).width
  let fittedSize = Math.max(minimum, Math.min(size, size * maxWidth / Math.max(measured, 1)))
  context.font = font(fittedSize)
  // Font hinting/measurement can differ slightly after scaling. Never truncate
  // until the configured minimum has actually been reached.
  while (context.measureText(text).width > maxWidth && fittedSize > minimum) {
    fittedSize = Math.max(minimum, fittedSize * 0.99)
    context.font = font(fittedSize)
  }
  if (context.measureText(text).width <= maxWidth) return { text, size: fittedSize }
  const chars = Array.from(text)
  let low = 0, high = Math.max(0, chars.length - 1), fitted = ''
  while (low <= high) {
    const count = Math.floor((low + high) / 2)
    const tail = Math.ceil(count / 2)
    const candidate = chars.slice(0, count - tail).join('') + '...' + (tail ? chars.slice(-tail).join('') : '')
    if (context.measureText(candidate).width <= maxWidth) { fitted = candidate; low = count + 1 } else high = count - 1
  }
  return { text: fitted, size: fittedSize }
}

/** Transparent preview and opaque export composite use exactly the same drawing path. */
export class BurnInRenderer {
  readonly canvas = document.createElement('canvas')
  private readonly context: CanvasRenderingContext2D
  constructor() {
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is required for burn-in overlays.')
    this.context = context
    this.canvas.className = 'burn-in-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
  }
  draw(width: number, height: number, settings: BurnInSettings, data: BurnInData, scene?: HTMLCanvasElement, guideAspect?: number, background: BackgroundMode = 'dark') {
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    const ctx = this.context
    ctx.clearRect(0, 0, width, height)
    if (scene) ctx.drawImage(scene, 0, 0, width, height)
    const area = frameRect(width, height, guideAspect)
    const scale = area.height / 1080, size = 24 * scale, margin = 32 * scale
    const y = area.height - margin
    ctx.save()
    ctx.translate(area.x, area.y)
    ctx.beginPath(); ctx.rect(0, 0, area.width, area.height); ctx.clip()
    ctx.fillStyle = BACKGROUND_THEMES[background].burnInText; ctx.strokeStyle = BACKGROUND_THEMES[background].burnInOutline
    ctx.lineWidth = 2 * scale; ctx.lineJoin = 'round'; ctx.textBaseline = 'bottom'
    const draw = (text: string, x: number) => { ctx.strokeText(text, x, y); ctx.fillText(text, x, y) }
    if (settings.filename) {
      const fitted = fitFilename(ctx, data.name, Math.max(0, Math.min(area.width * 0.63, area.width - margin * 2)), size, 14 * scale)
      ctx.font = font(fitted.size); ctx.textAlign = 'left'
      draw(fitted.text, margin)
    }
    if (settings.frame) {
      const text = frameCounter(data)
      ctx.font = font(size)
      const available = Math.max(1, area.width * 0.30 - margin)
      ctx.font = font(size * Math.min(1, available / Math.max(1, ctx.measureText(text).width)))
      ctx.textAlign = 'right'; draw(text, area.width - margin)
    }
    ctx.restore()
  }
  dispose() { this.canvas.remove(); this.canvas.width = 0; this.canvas.height = 0 }
}
