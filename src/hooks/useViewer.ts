import { useEffect, useRef, useState } from 'react'
import { ViewerEngine } from '../viewer/ViewerEngine'
import { INITIAL_SNAPSHOT } from '../types/viewer'

export function useViewer() {
  const container = useRef<HTMLDivElement>(null)
  const engine = useRef<ViewerEngine | null>(null)
  const [state, setState] = useState(INITIAL_SNAPSHOT)
  const [startupError, setStartupError] = useState<string | null>(null)
  useEffect(() => {
    if (!container.current) return
    let viewer: ViewerEngine
    try {
      viewer = new ViewerEngine(container.current, setState)
      engine.current = viewer
    } catch {
      // Schedule the error as an external initialization result.
      queueMicrotask(() => setStartupError('WebGL 2 could not start. Enable hardware acceleration in Chrome and reload.'))
      return
    }
    return () => { viewer.dispose(); engine.current = null }
  }, [])
  return { container, engine, state, startupError }
}
