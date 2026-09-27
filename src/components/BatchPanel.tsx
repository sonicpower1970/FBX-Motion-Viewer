import { useEffect, useRef, useState } from 'react'
import { BatchController, chooseBatchFolder, directorySupported } from '../batch/BatchController'
import type { OutputDirectory } from '../batch/BatchController'

export function BatchPanel({ initialFiles, onClose }: { initialFiles: File[]; onClose: () => void }) {
  const [, redraw] = useState(0)
  const [controller] = useState(() => new BatchController(() => redraw(n => n + 1)))
  const [folder, setFolder] = useState<OutputDirectory | null>(null)
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p')
  const [burnIn, setBurnIn] = useState(true)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const initialized = useRef(false)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    if (!initialized.current) { controller.add(initialFiles); initialized.current = true }
    // Defer disposal so React StrictMode's setup/cleanup probe does not kill the queue.
    return () => { queueMicrotask(() => { if (!element?.isConnected) controller.dispose() }) }
  }, [controller, initialFiles])
  const add = (files: File[]) => {
    if (files.some(file => !/\.fbx$/i.test(file.name))) setError('Only .fbx files can be added.')
    else setError('')
    controller.add(files.filter(file => /\.fbx$/i.test(file.name)))
  }
  const selectFolder = async () => {
    try { setFolder(await chooseBatchFolder()); setError('') }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setError(error instanceof Error ? error.message : 'Could not select folder.') }
  }
  const run = (retry = false) => { if (folder) { setError(''); void controller.run({ directory: folder, resolution, burnIn }, retry) } }
  const done = controller.jobs.filter(j => j.status === 'Done').length
  const failed = controller.jobs.filter(j => j.status === 'Failed').length
  const cancelled = controller.jobs.filter(j => j.status === 'Cancelled').length
  const current = controller.jobs.find(j => ['Loading', 'Exporting', 'Saving'].includes(j.status))
  const settled = done + failed + cancelled
  return <dialog ref={dialog} className="batch-panel" aria-labelledby="batch-title" onCancel={event => { event.preventDefault(); if (controller.running) controller.cancel(); else onClose() }}
    onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); add(Array.from(event.dataTransfer.files)) }}>
    <header><h2 id="batch-title">BATCH FBX → MP4</h2><button onClick={onClose} disabled={controller.running}>Close</button></header>
    <p>Sequential local export · Default take · FPS: AUTO · Camera: FIT + FOLLOW</p>
    <div className="batch-actions"><button disabled={controller.running} onClick={() => input.current?.click()}>ADD FBX FILES</button><button disabled={controller.running} onClick={() => controller.clear()}>CLEAR QUEUE</button><span>or drop multiple FBX files here</span></div>
    <input ref={input} className="visually-hidden" type="file" accept=".fbx" multiple aria-label="Batch input files" disabled={controller.running} onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <div className="batch-settings">
      <div className="batch-folder">Output Folder <button aria-label="SELECT FOLDER" disabled={controller.running || !directorySupported()} onClick={() => void selectFolder()}>SELECT FOLDER</button><span>{folder?.name ?? 'Not selected'}</span></div>
      <label>Resolution <select aria-label="Batch resolution" value={resolution} disabled={controller.running} onChange={event => setResolution(event.target.value as '1080p' | '720p')}><option value="1080p">1920 x 1080</option><option value="720p">1280 x 720</option></select></label>
      <button disabled={controller.running} aria-pressed={burnIn} onClick={() => setBurnIn(!burnIn)}>BURN-IN {burnIn ? 'ON' : 'OFF'}</button>
    </div>
    {!directorySupported() && <p role="alert">Batch saving requires folder access in Chrome / Chromium on localhost or HTTPS. Single Export remains available.</p>}
    {error && <p role="alert">{error}</p>}
    <div className="batch-table"><table><thead><tr><th>Filename</th><th>Detected FPS</th><th>Frames</th><th>Status</th><th>Progress</th></tr></thead><tbody>
      {controller.jobs.map(job => <tr key={job.id}><td title={job.file.name}>{job.file.name}{job.error && <small>{job.error}</small>}{job.outputName && <small>→ {job.outputName}</small>}</td><td title={job.frameRate?.source}>{job.frameRate ? `${Number(job.frameRate.fps.toFixed(3))} fps${job.frameRate.fallback ? ' (fallback)' : ''}` : 'After load'}</td><td>{job.frames ?? '—'}</td><td>{job.status}</td><td><progress max={1} value={job.progress} /><small>{Math.floor(job.progress * 100)}% {job.detail}</small></td></tr>)}
    </tbody></table></div>
    <p role="status">Batch {settled} / {controller.jobs.length} · Completed: {done} · Failed: {failed} · Cancelled: {cancelled}</p>
    <progress aria-label="Batch overall progress" max={Math.max(1, controller.jobs.length)} value={settled + (current?.progress ?? 0)} />
    {current && <p>Current File: {current.file.name} — {current.detail}</p>}
    <footer className="batch-actions"><button disabled={controller.running || !folder || !controller.jobs.some(j => j.status === 'Waiting' || j.status === 'Cancelled')} onClick={() => run()}>START BATCH</button><button disabled={controller.running || !folder || !failed} onClick={() => run(true)}>RETRY FAILED</button><button disabled={!controller.running} onClick={() => controller.cancel()}>CANCEL BATCH</button></footer>
    <small>FPS and frames are detected when each job loads. Existing MP4 files are preserved with numbered filenames. Keep this tab open; modern FBX parsing may delay cancellation.</small>
  </dialog>
}
