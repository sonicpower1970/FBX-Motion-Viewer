export interface VideoFileHandle {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>
}
export type VideoDestination = { name: string; handle?: VideoFileHandle }
type SaveWindow = Window & { showSaveFilePicker?: (options: {
  suggestedName: string; types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<VideoFileHandle> }

export function videoFileName(source: string): string {
  const base = source.replace(/\.fbx$/i, '').split('').map(char =>
    char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '_' : char).join('').replace(/[. ]+$/, '')
  return `${base || 'preview'}.mp4`
}

// Call during the click handler, before any import, render or encode awaits.
export async function chooseVideoDestination(name: string): Promise<VideoDestination> {
  const browser = window as SaveWindow
  if (typeof browser.showSaveFilePicker !== 'function') return { name }
  return { name, handle: await browser.showSaveFilePicker({ suggestedName: name,
    types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
  }) }
}

export async function saveExportedVideo(blob: Blob, destination: VideoDestination, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  if (destination.handle) {
    const stream = await destination.handle.createWritable()
    try {
      signal.throwIfAborted()
      await stream.write(blob)
      signal.throwIfAborted()
      // close commits the file. Once committed, a late cancellation cannot undo it.
      await stream.close()
    } catch (error) {
      await stream.abort().catch(() => {})
      throw error
    }
    return
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = destination.name
  document.body.append(link)
  try { link.click() } finally {
    link.remove()
    // Let the browser consume the URL before releasing the output buffer.
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}
