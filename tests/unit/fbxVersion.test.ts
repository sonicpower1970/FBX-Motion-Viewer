import { describe, expect, it } from 'vitest'
import { readFbxVersion, requiresLegacyReader } from '../../src/viewer/fbxVersion'
const ascii = (version: number) => new TextEncoder().encode(`; FBX\nFBXHeaderExtension: { FBXVersion: ${version} }`).buffer
const binary = (version: number) => {
  const b = new ArrayBuffer(27)
  new Uint8Array(b).set(new TextEncoder().encode('Kaydara FBX Binary  \0\x1a\0'))
  new DataView(b).setUint32(23, version, true)
  return b
}
describe('legacy routing', () => {
  it('uses actual format-specific Three.js version boundaries', () => {
    for (const version of [6000, 6100, 6300]) expect(requiresLegacyReader(binary(version))).toBe(true)
    for (const version of [6400, 7400, 7500]) expect(requiresLegacyReader(binary(version))).toBe(false)
    expect(requiresLegacyReader(ascii(6100))).toBe(true)
    expect(requiresLegacyReader(ascii(7000))).toBe(false)
    expect(readFbxVersion(binary(6000))).toEqual({ version: 6000, binary: true })
  })
  it('does not reinterpret truncated or unrecognized files as legacy', () => {
    expect(readFbxVersion(new ArrayBuffer(0))).toBeNull()
    expect(readFbxVersion(binary(6000).slice(0, 26))).toBeNull()
    expect(requiresLegacyReader(new TextEncoder().encode('not fbx').buffer)).toBe(false)
  })
})
