import { expect, test } from 'vitest'
import { burnInBasename, fitFilename, frameCounter } from '../../src/overlay/BurnInRenderer'

test('burn-in never exposes directories on either path convention', () => {
  expect(burnInBasename('/Users/person/private/motion.fbx')).toBe('motion.fbx')
  expect(burnInBasename('C:\\private\\motion.fbx')).toBe('motion.fbx')
})
test('counter shares timeline rounding, offsets and fractional endpoint', () => {
  const data = { name: '', time: 0, duration: 350 / 30, fps: 30, startFrame: 0 }
  expect(frameCounter(data)).toBe('0000 / 0350')
  expect(frameCounter({ ...data, time: 123 / 30 })).toBe('0123 / 0350')
  expect(frameCounter({ ...data, time: data.duration })).toBe('0350 / 0350')
  expect(frameCounter({ ...data, startFrame: 1001 })).toBe('1001 / 1351')
  expect(frameCounter({ ...data, startFrame: 10001 })).toBe('10001 / 10351')
  expect(frameCounter({ ...data, duration: 1, time: 1, fps: 24000 / 1001 })).toBe('0024 / 0024')
})
test('filename fits by shrinking before middle truncation and preserves extension', () => {
  const context = { font: '', measureText(this: { font: string }, text: string) { return { width: Array.from(text).length * parseFloat(this.font.split(' ')[1]) * .6 } } } as unknown as CanvasRenderingContext2D
  expect(fitFilename(context, 'walk.fbx', 200, 24, 14)).toEqual({ text: 'walk.fbx', size: 24 })
  const medium = fitFilename(context, 'character_walk.fbx', 200, 24, 14)
  expect(medium.text).toBe('character_walk.fbx'); expect(medium.size).toBeLessThan(24)
  const long = fitFilename(context, 'character_'.repeat(50) + '_v023.fbx', 200, 24, 14)
  expect(long.size).toBe(14); expect(long.text).toContain('...'); expect(long.text.endsWith('.fbx')).toBe(true)
  expect(context.measureText(long.text).width).toBeLessThanOrEqual(200)
})
