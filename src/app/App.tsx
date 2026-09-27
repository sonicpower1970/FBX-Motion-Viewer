import { BatchPanel } from '../components/BatchPanel'
import { useEffect, useRef, useState } from 'react'
import { useViewer } from '../hooks/useViewer'
import { PreviewPanel } from '../components/PreviewPanel'
import { FrameGuide } from '../components/FrameGuide'
import { Timeline } from '../components/Timeline'
import { endFrame } from '../utils/frameTime'
import './app.css'

export default function App() {
  const { container, engine, state, startupError } = useViewer()
  const [batchFiles, setBatchFiles] = useState<File[] | null>(null)
  const busy = state.loading || state.exporting || batchFiles !== null
  const openBatch = (files: File[] = []) => { engine.current?.suspendRendering(true); setBatchFiles(files) }
  const closeBatch = () => { setBatchFiles(null); engine.current?.suspendRendering(false) }
  const fileInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const loadFiles = (files: FileList | null) => {
    if (!files?.length || busy || startupError) return
    if (files.length !== 1) {
      if (Array.from(files).every(file => /\.fbx$/i.test(file.name))) { setDropError(null); openBatch(Array.from(files)) }
      else setDropError('Only FBX files are supported. External texture files are not supported.')
      return
    }
    setDropError(null)
    void engine.current?.load(files[0])
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('input, select, textarea, button, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return
      const viewer = engine.current
      if (!viewer || busy) return
      switch (event.key.toLowerCase()) {
        case 'f': event.preventDefault(); viewer.fit(); break
        case ' ': event.preventDefault(); viewer.togglePlay(); break
        case 'arrowleft': event.preventDefault(); viewer.step(-1); break
        case 'arrowright': event.preventDefault(); viewer.step(1); break
        case 'home': event.preventDefault(); viewer.seekFrame(state.startFrame); break
        case 'end': event.preventDefault(); viewer.seekFrame(endFrame(state.duration, state.fps, state.startFrame)); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, state.duration, state.fps, state.startFrame, busy])

  const open = () => fileInput.current?.click()
  const error = startupError ?? dropError ?? state.error
  return <><main inert={batchFiles !== null} className="app-shell"
    onDragEnter={(event) => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true) } }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy' }}
    onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); loadFiles(event.dataTransfer.files) }}>
    <header className="app-header">
      <div className="brand"><span className="brand-mark" aria-hidden="true">M</span><h1>FBX <strong>Motion Viewer</strong></h1><span className="version">v0.3.0</span></div>
      <div className="local-badge"><span /> LOCAL FILES ONLY</div>
      <button disabled={busy || !!startupError} onClick={() => openBatch()}>BATCH EXPORT</button>
      <button className="open-button" onClick={open} disabled={busy || !!startupError}>＋ Open FBX</button>
      <input ref={fileInput} className="visually-hidden" type="file" accept=".fbx" aria-label="Open FBX file" disabled={busy || !!startupError} onChange={(event) => { loadFiles(event.target.files); event.target.value = '' }} />
    </header>

    <div className="toolbar">
      <div className="file-label"><span className="file-icon" aria-hidden="true">◇</span><span title={state.asset?.name}>{state.asset?.name ?? 'Untitled scene'}</span>{state.asset && <span className="file-size">{(state.asset.size / 1024 / 1024).toFixed(1)} MB</span>}</div>
      <div className="display-controls" role="group" aria-label="Display options">
        {(['meshVisible', 'boneVisible', 'gridVisible'] as const).map((kind, index) => <button key={kind} disabled={state.exporting} aria-pressed={state[kind]} onClick={() => engine.current?.setVisibility(kind, !state[kind])}>{['Mesh', 'Bones', 'Grid'][index]}</button>)}
        <button aria-pressed={state.xray} disabled={state.exporting} onClick={() => engine.current?.setXRay(!state.xray)}>X-Ray</button>
        <button aria-pressed={state.shadow} disabled={state.exporting} onClick={() => engine.current?.setShadow(!state.shadow)}>Shadow</button>
        <button aria-pressed={state.burnIn} disabled={state.exporting} onClick={() => engine.current?.setBurnIn(!state.burnIn)}>BURN-IN</button>
        <button className="frame-guide-button" aria-label="16:9 Frame Guide" title="16:9 Frame Guide" disabled={state.exporting} aria-pressed={state.frameGuide !== 'off'} onClick={() => engine.current?.setFrameGuide(state.frameGuide === 'off' ? '16:9' : 'off')}>
          <svg width="22" height="16" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true" focusable="false">
            <path d="M8 2H2v4M16 2h6v4M2 12v4h6M22 12v4h-6" />
          </svg>
        </button>
        <span className="separator" />
        <button aria-label="FIT" aria-pressed={state.fitEnabled} disabled={busy} onClick={() => engine.current?.setFitEnabled(!state.fitEnabled)} title="Toggle automatic fitting. F fits the current frame once.">FIT <kbd>F</kbd></button>
        <button aria-pressed={state.follow} disabled={busy || !state.asset} onClick={() => engine.current?.setFollow(!state.follow)}>Follow</button>
      </div>
    </div>

    <div className="take-bar">
      <label>ANIMATION TAKE <select aria-label="Animation take" value={state.clipIndex} disabled={!state.asset?.clips.length || busy} onChange={(event) => engine.current?.selectClip(Number(event.target.value))}>
        {!state.asset?.clips.length && <option value={-1}>No animation</option>}
        {state.asset?.clips.map((clip, index) => <option key={index} value={index}>{clip.name}</option>)}
      </select></label>
      <span>{state.asset ? `${state.asset.meshes} meshes · ${state.asset.bones} bones · ${state.asset.clips.length} takes` : 'Ready for motion review'}</span>
    </div>

    <section className={`viewport-shell${state.burnIn ? ' has-burn-in' : ''}`} aria-label="Viewer">
      <div className="viewport" ref={container} />
      <FrameGuide mode={state.frameGuide} />
      <div className="viewport-label">PERSPECTIVE <span>Y UP</span></div>
      {!state.asset && !state.loading && !startupError && <div className="empty-state">
        <svg className="empty-icon" viewBox="0 0 72 72" fill="none" aria-hidden="true"><path d="m36 8 23 13v28L36 63 13 49V21L36 8Z" /><path d="m13 21 23 14 23-14M36 35v28M36 8v27M13 49l23-14 23 14" /></svg>
        <h2>Bring your motion into view.</h2>
        <p>Drop an FBX file to inspect mesh, skeleton, and animation.</p>
        <button className="empty-open" onClick={open}>Browse files <span>↗</span></button>
        <small>Maya / MotionBuilder · Up to 500 MiB · Processed locally</small>
      </div>}
      {state.loading && <div className="loading-overlay" role="status"><span className="spinner" /><strong>Loading {state.pendingName}</strong><span>Parsing locally. Large files can take a while.</span><button onClick={() => engine.current?.cancelLoad()}>Cancel loading</button></div>}
      {state.exporting && <div className="loading-overlay" role="status"><strong>{state.exportStatus}</strong><progress aria-label="Export progress" max={1} value={state.exportProgress} /><span>{Math.floor(state.exportProgress * 100)}%</span><span>The viewer will be restored when export finishes.</span><button onClick={() => engine.current?.cancelExport()}>Cancel export</button></div>}
      <div className="navigation-hint"><span>Alt + drag</span> Orbit / Pan / Dolly <b>·</b> Scroll to zoom <b>·</b> <span>F</span> Fit</div>
    </section>

    {error && <div className="error-banner" role="alert">{error}</div>}
    {!!state.asset?.warnings.length && <details className="warnings"><summary>{state.asset.warnings.length} asset notice{state.asset.warnings.length === 1 ? '' : 's'}</summary><ul>{state.asset.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}

    <PreviewPanel state={state} onExport={resolution => { void engine.current?.exportMovie(resolution) }} />
    <Timeline state={state} onSeek={(frame) => engine.current?.seekFrame(frame)} onStep={(direction) => engine.current?.step(direction)} onPlay={() => engine.current?.togglePlay()} onLoop={(loop) => engine.current?.setLoop(loop)} onSpeed={speed => engine.current?.setSpeed(speed)} onFps={(fps) => engine.current?.setFps(fps)} />

    <footer className="status-bar"><span><i className="status-dot" />{state.exporting ? 'EXPORTING' : state.loading ? 'LOADING' : state.playing ? 'PLAYING' : state.asset ? 'READY' : 'NO FILE LOADED'}</span><span>Space Play / Pause <b>·</b> ← → Frame step</span><a href={`${import.meta.env.BASE_URL}legal/index.html`} target="_blank" rel="noopener noreferrer">Licenses</a><span className="render-fps">Render <strong>{Math.round(state.renderFps)}</strong> FPS</span></footer>
    {dragging && <div className="drop-overlay"><strong>{state.loading ? 'Please wait for the current file' : 'Drop your FBX here'}</strong><span>Files stay on this computer</span></div>}
  </main>{batchFiles !== null && <BatchPanel initialFiles={batchFiles} onClose={closeBatch} />}</>
}
