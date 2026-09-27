import { describe, expect, it } from 'vitest'
import { displayFrame, endFrame, FRAME_RATES, frameAtTime, steppedTime, timeAtFrame } from '../../src/utils/frameTime'

describe('frame/time contract', () => {
  it.each(FRAME_RATES)('round-trips $label without accumulated frame-step drift', ({ value: fps }) => {
    for (const frame of [0, 1, 1001, 100000, 1000000]) {
      expect(frameAtTime(timeAtFrame(frame, fps), fps)).toBe(frame)
    }
    let time = 0
    for (let i = 0; i < 10000; i++) time = steppedTime(time, 1, 1000, fps)
    expect(time).toBeCloseTo(10000 / fps, 10)
  })
  it('keeps fractional broadcast rates as rational rates', () => {
    expect(timeAtFrame(30000, FRAME_RATES[3].value)).toBe(1001)
    expect(timeAtFrame(60000, FRAME_RATES[6].value)).toBe(1001)
  })
  it('supports future display offsets without changing sample time', () => {
    expect(timeAtFrame(1031, 30, 1001)).toBe(1)
    expect(frameAtTime(1, 30, 1001)).toBe(1031)
    expect(endFrame(2, 30, 1001)).toBe(1061)
  })
  it('includes an exact off-grid endpoint and clamps step operations', () => {
    expect(endFrame(1.01, 30)).toBe(31)
    expect(steppedTime(1, 1, 1.01, 30)).toBe(1.01)
    expect(displayFrame(1.01, 1.01, 30)).toBe(31)
    expect(steppedTime(1.01, -1, 1.01, 30)).toBe(1)
    expect(steppedTime(0, -1, 1.01, 30)).toBe(0)
  })
})
