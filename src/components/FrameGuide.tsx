import { useEffect, useRef, useState } from 'react'

import { FRAME_GUIDES, guideSize } from '../utils/frameGuide'
import type { FrameGuideMode } from '../utils/frameGuide'

export function FrameGuide({ mode }: { mode: FrameGuideMode }) {
  const host = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = host.current
    if (!element || mode === 'off') return
    const observer = new ResizeObserver(([entry]) => {
      setSize(guideSize(entry.contentRect.width, entry.contentRect.height, FRAME_GUIDES[mode]))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [mode])
  return <div ref={host} className="frame-guide-overlay" aria-hidden="true">
    {mode !== 'off' && <div className="frame-guide" data-testid="frame-guide" style={size}><span>{mode} COMPOSITION GUIDE</span></div>}
  </div>
}
