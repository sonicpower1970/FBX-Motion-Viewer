export const FRAME_GUIDES = { '16:9': 16 / 9 } as const
export type FrameGuideMode = 'off' | keyof typeof FRAME_GUIDES

export function guideSize(width: number, height: number, aspect: number) {
  const w = Math.min(width, height * aspect)
  return { width: w, height: w / aspect }
}


export interface FrameRect { x: number; y: number; width: number; height: number }
export function frameRect(width: number, height: number, aspect?: number): FrameRect {
  const size = aspect ? guideSize(width, height, aspect) : { width, height }
  return { x: (width - size.width) / 2, y: (height - size.height) / 2, ...size }
}
