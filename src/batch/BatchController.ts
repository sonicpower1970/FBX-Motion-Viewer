import type { BackgroundMode } from '../viewer/backgroundTheme'
import { ViewerEngine } from '../viewer/ViewerEngine'
import type { ViewerSnapshot } from '../types/viewer'
import type { FbxFrameRate } from '../viewer/fbxFrameRate'
import type { VideoFileHandle } from '../export/saveExportedVideo'
import { videoFileName } from '../export/saveExportedVideo'
import { exportTiming } from '../utils/exportTiming'

export interface OutputDirectory {
  name: string
  getFileHandle(name: string, options?: { create?: boolean }): Promise<VideoFileHandle>
}
type DirectoryWindow = Window & { showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<OutputDirectory> }
export const directorySupported = () => typeof (window as DirectoryWindow).showDirectoryPicker === 'function'
export async function chooseBatchFolder() {
  const picker = (window as DirectoryWindow).showDirectoryPicker
  if (!picker) throw new Error('Batch saving requires a browser with folder access. Use Chrome / Chromium on localhost or HTTPS. Single Export is still available.')
  return picker.call(window, { mode: 'readwrite' })
}
export type JobStatus = 'Waiting' | 'Loading' | 'Exporting' | 'Saving' | 'Done' | 'Failed' | 'Cancelled'
export interface BatchJob {
  id: number; file: File; status: JobStatus; progress: number; detail: string
  frameRate?: FbxFrameRate; frames?: number; outputName?: string; error?: string
}
export interface BatchOptions { resolution: '720p' | '1080p'; background?: BackgroundMode; burnIn: boolean; directory: OutputDirectory }

// Defer file creation until the shared exporter is ready to save. Never overwrite
// existing previews (including sanitized-name/case collisions on the target FS).
export async function uniqueOutput(directory: OutputDirectory, source: string) {
  const base = videoFileName(source).slice(0, -4)
  for (let index = 0; index < 10000; index++) {
    const name = `${base}${index ? ` (${index})` : ''}.mp4`
    try { await directory.getFileHandle(name) }
    catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return { name, handle: await directory.getFileHandle(name, { create: true }) }
      throw error
    }
  }
  throw new Error('Could not find an unused output filename.')
}

export class BatchController {
  jobs: BatchJob[] = []
  running = false
  private cancelled = false
  private disposed = false
  private nextId = 1
  private active: ViewerEngine | null = null
  constructor(private readonly publish: () => void) {}
  add(files: File[]) {
    if (this.running) return
    for (const file of files) this.jobs.push({ id: this.nextId++, file, status: 'Waiting', progress: 0, detail: '' })
    this.publish()
  }
  clear() { if (!this.running) { this.jobs = []; this.publish() } }
  cancel() {
    this.cancelled = true
    this.active?.cancelLoad(); this.active?.cancelExport()
  }
  dispose() { this.disposed = true; this.cancel() }
  async run(options: BatchOptions, retry = false) {
    if (this.running || this.disposed) return
    const pending = this.jobs.filter(job => retry ? job.status === 'Failed' : job.status === 'Waiting' || job.status === 'Cancelled')
    if (!pending.length) return
    this.running = true; this.cancelled = false
    pending.forEach(job => { job.status = 'Waiting'; job.progress = 0; job.error = undefined; job.detail = '' })
    this.publish()
    try {
      for (const job of pending) {
        if (this.cancelled) break
        let snapshot: ViewerSnapshot | undefined
        const host = document.createElement('div')
        host.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:540px;pointer-events:none'
        host.setAttribute('aria-hidden', 'true'); document.body.append(host)
        try {
          job.status = 'Loading'; job.detail = 'Loading FBX…'; this.publish()
          const viewer = new ViewerEngine(host, state => {
            snapshot = state
            if (state.exporting) {
              job.status = state.exportStatus === 'Saving MP4…' ? 'Saving' : 'Exporting'
              job.progress = state.exportProgress; job.detail = state.exportStatus
              if (!this.disposed) this.publish()
            }
          })
          this.active = viewer
          viewer.setBackground(options.background ?? 'dark')
          viewer.suspendRendering(true)
          await viewer.load(job.file)
          if (this.cancelled) throw new DOMException('Batch cancelled.', 'AbortError')
          job.frameRate = snapshot?.asset?.frameRate
          const { frameRate, duration } = viewer.prepareBatch(options.burnIn)
          job.frameRate = frameRate; job.frames = exportTiming(duration, frameRate.fps).count
          job.status = 'Exporting'; this.publish()
          await viewer.exportMovie(options.resolution, { name: videoFileName(job.file.name), handle: {
            createWritable: async () => {
              if (this.cancelled) throw new DOMException('Batch cancelled.', 'AbortError')
              const destination = await uniqueOutput(options.directory, job.file.name)
              job.outputName = destination.name
              return destination.handle.createWritable()
            },
          } })
          if (snapshot?.exportStatus === 'Export complete') { job.status = 'Done'; job.progress = 1; job.detail = 'Export complete' }
          else if (this.cancelled || snapshot?.exportStatus === 'Export cancelled') throw new DOMException('Batch cancelled.', 'AbortError')
          else throw new Error(snapshot?.error || 'Export failed')
        } catch (error) {
          job.status = this.cancelled || (error instanceof DOMException && error.name === 'AbortError') ? 'Cancelled' : 'Failed'
          job.error = error instanceof Error ? error.message : String(error)
          job.detail = job.error
        } finally {
          this.active?.dispose(); this.active = null; host.remove()
          if (!this.disposed) this.publish()
        }
      }
    } finally {
      if (this.cancelled) pending.forEach(job => { if (job.status === 'Waiting') { job.status = 'Cancelled'; job.detail = 'Not started' } })
      this.running = false
      if (!this.disposed) this.publish()
    }
  }
}
