import { readFbxVersion } from './fbxVersion'

export interface FbxFrameRate { fps: number; fallback: boolean; source: string }
const rates: Record<number, number> = { 1: 120, 2: 100, 3: 60, 4: 50, 5: 48, 6: 30, 7: 30,
  8: 30000 / 1001, 9: 30000 / 1001, 10: 25, 11: 24, 12: 1000, 13: 24000 / 1001,
  15: 96, 16: 72, 17: 60000 / 1001, 18: 120000 / 1001 }
const fallback = (): FbxFrameRate => ({ fps: 30, fallback: true, source: 'Missing or unsupported FBX time metadata' })
const names = new Set(['TimeMode', 'CustomFrameRate', 'FrameRate'])
const scope = (path: string[]) => path[0] === 'GlobalSettings' || (path[0] === 'Objects' && path[1] === 'GlobalSettings') || path[0] === 'Settings' || (path[0] === 'Version5' && path[1] === 'Settings')

// Metadata only: no key-spacing inference, animation resampling or scene changes.
export function readFbxFrameRate(buffer: ArrayBuffer): FbxFrameRate {
  const values = new Map<string, number>()
  const accept = (path: string[], name: string, props: (string | number)[]) => {
    if (!scope(path)) return
    const key = name === 'P' || name === 'Property' ? String(props[0]) : name
    // Pre-7000 Settings uses legacy enums. Like ufbx, trust its explicit
    // FrameRate string, not a modern interpretation of Settings.TimeMode.
    if ((key === 'TimeMode' || key === 'CustomFrameRate') && !path.includes('GlobalSettings')) return
    if (names.has(key)) {
      const raw = props.at(-1)
      if (raw !== undefined && String(raw).trim() !== '') values.set(key, Number(raw))
    }
  }
  try {
    const bytes = new Uint8Array(buffer), decoder = new TextDecoder()
    const info = readFbxVersion(buffer)
    if (info?.binary) {
      const view = new DataView(buffer), wide = info.version >= 7500, header = wide ? 25 : 13
      const integer = (offset: number) => wide ? Number(view.getBigUint64(offset, true)) : view.getUint32(offset, true)
      const walk = (start: number, limit: number, path: string[]) => {
        if (path.length > 12) throw new Error('Metadata nesting')
        for (let offset = start; offset + header <= limit;) {
          const end = integer(offset)
          if (!end) break
          const count = integer(offset + (wide ? 8 : 4)), length = integer(offset + (wide ? 16 : 8))
          const nameLength = view.getUint8(offset + header - 1)
          if (!Number.isSafeInteger(end) || end <= offset || end > limit) throw new Error('Invalid node')
          const name = decoder.decode(bytes.subarray(offset + header, offset + header + nameLength))
          let p = offset + header + nameLength
          const child = p + length
          if (child > end) throw new Error('Invalid properties')
          const nextPath = [...path, name]
          const interested = scope(path) || scope(nextPath) || (path.length === 0 && (name === 'Version5' || name === 'Objects'))
          if (interested) {
            const props: (string | number)[] = []
            for (let n = 0; n < count; n++) {
              if (p >= child || n > 64) throw new Error('Invalid metadata')
              const type = String.fromCharCode(bytes[p++])
              if (type === 'S' || type === 'R') {
                const size = view.getUint32(p, true); p += 4
                props.push(type === 'S' && size < 2048 ? decoder.decode(bytes.subarray(p, p + size)) : '')
                p += size
              } else if ('fdilbc'.includes(type)) { const size = view.getUint32(p + 8, true); p += 12 + size }
              else {
                const sizes: Record<string, number> = { Y: 2, C: 1, I: 4, F: 4, D: 8, L: 8 }
                if (!sizes[type]) throw new Error('Unknown property')
                const value = type === 'Y' ? view.getInt16(p, true) : type === 'C' ? view.getUint8(p) : type === 'I' ? view.getInt32(p, true) : type === 'F' ? view.getFloat32(p, true) : type === 'D' ? view.getFloat64(p, true) : Number(view.getBigInt64(p, true))
                props.push(value); p += sizes[type]
              }
              if (p > child) throw new Error('Invalid property length')
            }
            accept(path, name, props)
            walk(child, end, nextPath)
          }
          offset = end
        }
      }
      walk(27, bytes.length, [])
    } else {
      // Line-by-line decoding avoids making a second 500 MiB ASCII string.
      // Oversized array/image lines are skipped; metadata records are small.
      const path: string[] = []
      let start = 0
      while (start < bytes.length) {
        let end = bytes.indexOf(10, start); if (end < 0) end = bytes.length
        if (end - start < 65536) {
          const line = decoder.decode(bytes.subarray(start, end))
          // Tokenize complete FBX records, respecting quoted strings and comments.
          let name = '', props: (string | number)[] = []
          const flush = () => { if (name) accept(path, name, props); name = ''; props = [] }
          for (const match of line.matchAll(/"(?:\\.|[^"\\])*"|;.*$|[A-Za-z_][\w]*\s*:|[{}]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)) {
            const token = match[0]
            if (token.startsWith(';')) break
            if (token.endsWith(':')) { flush(); name = token.slice(0, -1).trim() }
            else if (token === '{') { const node = name; flush(); path.push(node) }
            else if (token === '}') { flush(); path.pop() }
            else props.push(token.startsWith('"') ? token.slice(1, -1) : Number(token))
          }
          flush()
        }
        start = end + 1
      }
    }
    const mode = values.get('TimeMode')
    let fps = mode === 14 ? values.get('CustomFrameRate') : mode !== undefined ? rates[mode] : values.get('FrameRate') ?? values.get('CustomFrameRate')
    if (!fps || !Number.isFinite(fps) || fps <= 0 || fps > 1000) return fallback()
    // Conventional decimal labels denote NTSC rational time bases.
    for (const [label, rational] of [[23.976, 24000 / 1001], [29.97, 30000 / 1001], [59.94, 60000 / 1001]]) {
      if (Math.abs(fps - label) < 0.00001) fps = rational
    }
    return { fps, fallback: false, source: mode !== undefined ? `TimeMode ${mode}${mode === 14 ? ' / CustomFrameRate' : ''}` : values.has('FrameRate') ? 'Legacy FrameRate' : 'CustomFrameRate' }
  } catch { return fallback() }
}
