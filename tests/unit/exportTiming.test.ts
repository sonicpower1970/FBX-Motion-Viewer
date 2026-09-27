import { expect, it } from 'vitest'
import { exportSize, exportTiming } from '../../src/utils/exportTiming'
import { FRAME_RATES } from '../../src/utils/frameTime'

it.each(FRAME_RATES)('samples absolute times including endpoint at $label', ({ value: fps }) => {
  const duration = 3.142, schedule = exportTiming(duration, fps)
  expect(schedule.sample(0).time).toBe(0)
  expect(schedule.sample(schedule.count - 1).time).toBe(duration)
  for (let i = 1; i < schedule.count; i++) {
    expect(schedule.sample(i).timestamp).toBe(i / fps)
    expect(schedule.sample(i).timestamp).toBeGreaterThan(schedule.sample(i - 1).timestamp)
    expect(schedule.sample(i).time).toBeLessThanOrEqual(duration)
  }
})
it('defines the exact endpoint hold and even physical viewport pixels', () => {
  expect(exportTiming(2, 30).count).toBe(61)
  expect(exportTiming(2, 30).duration).toBe(61 / 30)
  expect(exportSize('viewport', 1441, 901)).toEqual({ width: 1440, height: 900 })
  expect(exportSize('1080p', 0, 0)).toEqual({ width: 1920, height: 1080 })
  expect(() => exportTiming(0, 30)).toThrow()
})
