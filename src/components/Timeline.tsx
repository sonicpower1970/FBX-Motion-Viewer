import { useState } from 'react'
import type { ViewerSnapshot } from '../types/viewer'
import { displayFrame, endFrame, FRAME_RATES } from '../utils/frameTime'

interface Props {
  state: ViewerSnapshot
  onSeek: (frame: number) => void
  onStep: (direction: -1 | 1) => void
  onPlay: () => void
  onLoop: (enabled: boolean) => void
  onFps: (fps: number) => void
  onSpeed: (speed: number) => void
}

export function Timeline({ state, onSeek, onStep, onPlay, onLoop, onFps, onSpeed }: Props) {
  const frame = displayFrame(state.time, state.duration, state.fps, state.startFrame)
  const last = endFrame(state.duration, state.fps, state.startFrame)
  const disabled = !state.asset || state.clipIndex < 0 || state.duration <= 0 || state.loading || state.exporting
  const [draft, setDraft] = useState<string | null>(null)
  const ticks = Array.from({ length: 11 }, (_, i) => Math.round(state.startFrame + (last - state.startFrame) * i / 10))
  const commit = () => {
    if (draft !== null && draft.trim() !== '' && Number.isFinite(Number(draft))) onSeek(Number(draft))
    setDraft(null)
  }
  return <section className="timeline" aria-label="Animation timeline">
    <div className="timeline-heading">
      <span className="eyebrow">TIME SLIDER</span>
      <span className="time-readout">{state.time.toFixed(3)} s <span>/ {state.duration.toFixed(3)} s</span></span>
    </div>
    <div className={`ruler ${disabled ? 'is-disabled' : ''}`}>
      <div className="ticks" aria-hidden="true">{ticks.map((tick, i) => <span key={i}>{tick}</span>)}</div>
      <input aria-label="Timeline scrub" type="range" min={state.startFrame} max={Math.max(state.startFrame + 1, last)} step="1" value={frame} disabled={disabled} onChange={(event) => onSeek(Number(event.target.value))} />
    </div>
    <div className="transport-row">
      <div className="frame-fields">
        <label>Current <input aria-label="Current frame" className="frame-input" type="number" min={state.startFrame} max={last} step="1" value={draft ?? frame} disabled={disabled}
          onChange={(event) => setDraft(event.target.value)} onBlur={commit}
          onKeyDown={(event) => { if (event.key === 'Enter') { commit(); event.currentTarget.blur() } if (event.key === 'Escape') { event.preventDefault(); setDraft(null) } }} /></label>
        <span className="frame-end">End <output data-testid="end-frame">{last}</output></span>
      </div>
      <div className="transport-buttons">
        <button aria-label="Go to start" title="Go to start (Home)" disabled={disabled} onClick={() => onSeek(state.startFrame)}>│◀</button>
        <button aria-label="Previous frame" title="Previous frame (Left arrow)" disabled={disabled} onClick={() => onStep(-1)}>‹</button>
        <button className="play-button" aria-label={state.playing ? 'Pause' : 'Play'} title="Play / Pause (Space)" disabled={disabled} onClick={onPlay}>{state.playing ? 'Ⅱ' : '▶'}</button>
        <button aria-label="Next frame" title="Next frame (Right arrow)" disabled={disabled} onClick={() => onStep(1)}>›</button>
        <button aria-label="Go to end" title="Go to end (End)" disabled={disabled} onClick={() => onSeek(last)}>▶│</button>
        <button className="loop-button" aria-pressed={state.loop} aria-label="Loop" disabled={state.exporting} onClick={() => onLoop(!state.loop)}>↻ <span>Loop</span></button>
      </div>
      <label className="fps-picker">Speed
        <select aria-label="Playback speed" value={state.speed} disabled={state.loading || state.exporting} onChange={event => onSpeed(Number(event.target.value))}>
          {[0.25, 0.5, 1, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
      </label>
      <label className="fps-picker">Timeline FPS
        <select aria-label="Timeline FPS" value={state.fps} disabled={state.loading || state.exporting} onChange={(event) => onFps(Number(event.target.value))}>
          {FRAME_RATES.map(({ label, value }) => <option key={label} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
  </section>
}
