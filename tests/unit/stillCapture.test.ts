import { expect, test, vi } from 'vitest'
import { captureFileName, captureSize, chooseImageDestination, pngBlob } from '../../src/export/StillCapture'
import { frameCounter } from '../../src/overlay/BurnInRenderer'

const data = { name: 'Mutant_Walking.fbx', time: 123 / 30, duration: 5, fps: 30, startFrame: 0 }
test('PNG filenames share current/end-frame presentation numbering with Burn-in', () => {
  expect(captureFileName(data, true)).toBe('Mutant_Walking_f0123.png')
  expect(captureFileName({ ...data, time: 0 }, true)).toBe('Mutant_Walking_f0000.png')
  for (const startFrame of [0, 1, 1001, 10001]) {
    const sample = { ...data, startFrame }
    expect(captureFileName(sample, true)).toBe(`Mutant_Walking_f${frameCounter(sample).split(' / ')[0]}.png`)
  }
  const partial = { ...data, duration: 1.01, time: 1.01 }
  expect(captureFileName(partial, true)).toBe('Mutant_Walking_f0031.png')
})
test('static PNG filenames exclude frame and every parent directory', () => {
  for (const name of ['character.fbx', '/private/work/character.fbx', 'C:\\private\\character.FBX']) {
    expect(captureFileName({ ...data, name }, false)).toBe('character.png')
  }
  expect(captureFileName({ ...data, name: '/work/歩行.fbx' }, true)).toBe('歩行_f0123.png')
  expect(captureFileName({ ...data, name: 'bad:name?.fbx' }, false)).toBe('bad_name_.png')
})
test('guide output is Full HD; full viewport uses CSS size without AVC rounding or DPR', () => {
  expect(captureSize('16:9', 721, 901)).toEqual({ width: 1920, height: 1080 })
  expect(captureSize('off', 721, 901)).toEqual({ width: 721, height: 901 })
})
test('PNG picker specifies suggested name and image/png only; cancellation propagates', async () => {
  const picker = vi.fn().mockResolvedValue({})
  vi.stubGlobal('window', { showSaveFilePicker: picker })
  try {
    await chooseImageDestination('walk_f0025.png')
    expect(picker).toHaveBeenCalledWith({ suggestedName: 'walk_f0025.png', types: [
      { description: 'PNG image', accept: { 'image/png': ['.png'] } },
    ] })
    picker.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
    await expect(chooseImageDestination('walk.png')).rejects.toMatchObject({ name: 'AbortError' })
    vi.stubGlobal('window', {})
    expect(await chooseImageDestination('prop.png')).toEqual({ name: 'prop.png' })
  } finally { vi.unstubAllGlobals() }
})
test('PNG encoder failure is reported instead of saving empty output', async () => {
  const canvas = { toBlob: (callback: BlobCallback) => callback(null) } as HTMLCanvasElement
  await expect(pngBlob(canvas)).rejects.toThrow('Could not encode PNG')
})
