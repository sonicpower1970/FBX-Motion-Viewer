import { useState } from 'react'
import type { ViewerSnapshot } from '../types/viewer'
import { exportTiming } from '../utils/exportTiming'
import type { ExportResolution } from '../utils/exportTiming'

export function PreviewPanel({ state, onExport, onCapture }: { state: ViewerSnapshot; onCapture: () => void; onExport: (resolution: ExportResolution) => void }) {
  const [resolution, setResolution] = useState<ExportResolution>('720p')
  const busy = state.loading || state.exporting || state.capturing
  const timing = state.duration > 0 ? exportTiming(state.duration, state.fps) : null
  return <div className="preview-panel" aria-label="Preview movie">
    <label>PREVIEW <select aria-label="Export resolution" value={resolution} disabled={busy} onChange={event => setResolution(event.target.value as ExportResolution)}>
      <option value="720p">1280 × 720</option><option value="1080p">1920 × 1080</option><option value="viewport">Current Viewport (viewport aspect)</option>
    </select></label>
    <button disabled={busy || !state.asset} onClick={onCapture} title="Save the current frame and camera as PNG">CAPTURE</button>
    <button disabled={busy || !timing} onClick={() => onExport(resolution)}>EXPORT MP4</button>
    <span className="preview-note" title="720p/1080p match the centered 16:9 guide projection. FIT ON refits START; OFF preserves the camera. Current Viewport uses the full viewport and full-frame burn-in.">{resolution === 'viewport' ? 'Viewport aspect · ' : '16:9 · '}{timing ? `${timing.count} frames · ${timing.duration.toFixed(3)} s · full take at 1×, final pose included` : 'Full take · no UI or audio'}</span>
    <span className="preview-status" role="status">{state.capturing ? 'Capture in progress…' : state.exporting ? 'Export in progress…' : state.exportStatus || '\u00a0'}</span>
  </div>
}
