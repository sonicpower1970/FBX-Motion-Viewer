export const FRAME_RATES = [
  { label: '23.976', value: 24000 / 1001 },
  { label: '24', value: 24 },
  { label: '25', value: 25 },
  { label: '29.97', value: 30000 / 1001 },
  { label: '30', value: 30 },
  { label: '50', value: 50 },
  { label: '59.94', value: 60000 / 1001 },
  { label: '60', value: 60 },
] as const

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

// Start-frame offsets belong only to presentation, never to animation time.
export const frameAtTime = (time: number, fps: number, startFrame = 0) =>
  startFrame + Math.floor(Math.max(0, time) * fps + 1e-7)

export const timeAtFrame = (frame: number, fps: number, startFrame = 0) =>
  Math.max(0, (frame - startFrame) / fps)

// The final UI sample may be a partial frame. It always evaluates the exact end.
export const endFrame = (duration: number, fps: number, startFrame = 0) =>
  startFrame + Math.ceil(Math.max(0, duration) * fps - 1e-7)

export function displayFrame(time: number, duration: number, fps: number, startFrame = 0) {
  return duration > 0 && time >= duration - 1e-10
    ? endFrame(duration, fps, startFrame)
    : frameAtTime(time, fps, startFrame)
}

// Shared presentation numbering for Burn-in and still-image filenames.
export function formatFrame(frame: number, end: number) {
  const digits = Math.max(4, String(Math.abs(end)).length, String(Math.abs(frame)).length)
  return `${frame < 0 ? '-' : ''}${String(Math.abs(frame)).padStart(digits, '0')}`
}

export function steppedTime(time: number, direction: -1 | 1, duration: number, fps: number) {
  const frame = displayFrame(time, duration, fps)
  return clamp(timeAtFrame(frame + direction, fps), 0, duration)
}
