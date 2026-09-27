export function readFbxVersion(buffer: ArrayBuffer): { version: number; binary: boolean } | null {
  const prefix = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 65536))
  const magic = 'Kaydara FBX Binary  \0\x1a\0'
  if (prefix.length >= 27 && [...magic].every((c, i) => prefix[i] === c.charCodeAt(0))) {
    return { version: new DataView(buffer).getUint32(23, true), binary: true }
  }
  const text = new TextDecoder().decode(prefix)
  const match = text.match(/\bFBXVersion\s*:\s*(\d+)/)
  return match ? { version: Number(match[1]), binary: false } : null
}
export function requiresLegacyReader(buffer: ArrayBuffer) {
  const info = readFbxVersion(buffer)
  return info !== null && info.version < (info.binary ? 6400 : 7000)
}
