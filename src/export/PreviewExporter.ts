import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } from 'mediabunny'
import { exportTiming } from '../utils/exportTiming'

export interface PreviewJob {
  canvas: HTMLCanvasElement
  duration: number
  fps: number
  signal: AbortSignal
  draw: (time: number) => void
  progress: (fraction: number, status: string) => void
}
export async function renderPreview(job: PreviewJob): Promise<Blob> {
  const { canvas, duration, fps, signal, draw, progress } = job
  const schedule = exportTiming(duration, fps)
  signal.throwIfAborted()
  if (typeof VideoEncoder === 'undefined') throw new Error('MP4 export requires WebCodecs in a supported browser. Open this viewer in Chrome on localhost or HTTPS.')
  progress(0, 'Checking H.264 encoder…')
  const quality = new Quality({ bitrate: Math.round(Math.min(32e6, Math.max(2e6, canvas.width * canvas.height * fps * 0.14))) })
  if (!await canEncodeVideo('avc', { width: canvas.width, height: canvas.height, frameRate: fps, quality })) {
    throw new Error('H.264 encoding is unavailable at this resolution/FPS. Try 1280×720, a lower Timeline FPS, or another Chrome installation.')
  }
  signal.throwIfAborted()
  const target = new BufferTarget()
  target.onwrite = (_, end) => { if (end > 512 * 1024 * 1024) throw new Error('Preview exceeds the 512 MiB output limit. Use a lower resolution.') }
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  let encodedBytes = 0
  const source = new CanvasSource(canvas, {
    codec: 'avc', quality, latencyMode: 'quality',
    onEncodedPacket: packet => { encodedBytes += packet.data.byteLength; if (encodedBytes > 512 * 1024 * 1024) throw new Error('Preview exceeds the 512 MiB output limit.') },
  })
  output.addVideoTrack(source, { frameRate: fps })
  let cancellation: Promise<void> | undefined
  const abort = () => { cancellation ??= output.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted()
    await output.start()
    for (let index = 0; index < schedule.count; index++) {
      signal.throwIfAborted()
      const frame = schedule.sample(index)
      draw(frame.time)
      // Capture immediately after render, then await encoder backpressure. No clock or frame dropping.
      await source.add(frame.timestamp, frame.duration)
      progress((index + 1) / schedule.count, `Exporting ${index + 1} / ${schedule.count} frames`)
      if (index % 8 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0))
    }
    signal.throwIfAborted()
    progress(1, 'Finalizing MP4…')
    source.close()
    await output.finalize()
    signal.throwIfAborted()
    if (!target.buffer) throw new Error('The encoder did not produce a movie.')
    return new Blob([target.buffer], { type: 'video/mp4' })
  } finally {
    signal.removeEventListener('abort', abort)
    if (output.state !== 'finalized' && output.state !== 'canceled') abort()
    await cancellation
  }
}
