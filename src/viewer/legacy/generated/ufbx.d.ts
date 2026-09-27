import type { UfbxModule } from '../types'
export default function createUfbx(options: { wasmBinary: Uint8Array; printErr?: (text: string) => void }): Promise<UfbxModule>
