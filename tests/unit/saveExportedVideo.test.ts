import { describe, expect, it, vi } from 'vitest'
import { saveExportedVideo, videoFileName } from '../../src/export/saveExportedVideo'

describe('video saving', () => {
  it('preserves source names including Unicode and replaces the FBX extension', () => {
    expect(videoFileName('character_walk.fbx')).toBe('character_walk.mp4')
    expect(videoFileName('歩行.FBX')).toBe('歩行.mp4')
    expect(videoFileName('bad/name.fbx')).toBe('bad_name.mp4')
  })
  it('aborts an uncommitted write on failure', async () => {
    const stream = { write: vi.fn().mockRejectedValue(new Error('Disk full')), close: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) }
    await expect(saveExportedVideo(new Blob(['movie']), { name: 'test.mp4', handle: { createWritable: async () => stream } }, new AbortController().signal)).rejects.toThrow('Disk full')
    expect(stream.abort).toHaveBeenCalledOnce(); expect(stream.close).not.toHaveBeenCalled()
  })
  it('cancellation while writing prevents commit', async () => {
    const abort = new AbortController()
    const stream = { write: vi.fn(async () => { abort.abort() }), close: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) }
    await expect(saveExportedVideo(new Blob(), { name: 'test.mp4', handle: { createWritable: async () => stream } }, abort.signal)).rejects.toThrow()
    expect(stream.close).not.toHaveBeenCalled(); expect(stream.abort).toHaveBeenCalledOnce()
  })
})
