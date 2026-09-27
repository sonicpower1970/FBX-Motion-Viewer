import { buildLegacyScene } from './buildLegacyScene'
import type { LegacyScene } from './types'

export async function loadLegacyFbx(buffer: ArrayBuffer, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const scene = await new Promise<LegacyScene>((resolve, reject) => {
    const worker = new Worker(new URL('./legacy.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { worker.terminate(); signal?.removeEventListener('abort', abort) }
    const abort = () => { finish(); reject(new DOMException('Loading cancelled.', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ scene?: LegacyScene; error?: string }>) => {
      finish()
      if (event.data.scene) resolve(event.data.scene)
      else reject(new Error(event.data.error || 'Legacy FBX conversion failed.'))
    }
    worker.onerror = (event) => { finish(); reject(new Error(event.message || 'The legacy FBX worker stopped. Memory may be exhausted.')) }
    worker.onmessageerror = () => { finish(); reject(new Error('Could not receive the converted FBX.')) }
    worker.postMessage(buffer, [buffer])
  })
  signal?.throwIfAborted()
  return buildLegacyScene(scene, signal)
}
