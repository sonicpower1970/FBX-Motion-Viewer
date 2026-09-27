import createUfbx from './generated/ufbx.js'
import wasmUrl from './generated/ufbx.wasm?url'

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    // Only the bundled WASM code is fetched. FBX bytes never leave this worker.
    const response = await fetch(wasmUrl)
    if (!response.ok) throw new Error('The bundled legacy FBX reader could not be loaded.')
    const module = await createUfbx({ wasmBinary: new Uint8Array(await response.arrayBuffer()) })
    const bytes = new Uint8Array(event.data)
    const ptr = module._malloc(bytes.byteLength)
    if (!ptr) throw new Error('Not enough memory to read this FBX. Close other tabs or use a smaller file.')
    try {
      module.HEAPU8.set(bytes, ptr)
      if (!module._convert(ptr, bytes.byteLength)) throw new Error(module.error || 'Legacy FBX conversion failed.')
    } finally { module._free(ptr) }
    const buffers = new Set<ArrayBuffer>()
    const collect = (value: unknown) => {
      if (ArrayBuffer.isView(value)) buffers.add(value.buffer as ArrayBuffer)
      else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    collect(module.result)
    self.postMessage({ scene: module.result }, { transfer: [...buffers] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Legacy FBX conversion failed.' })
  }
}
