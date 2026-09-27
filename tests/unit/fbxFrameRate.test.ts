import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { readFbxFrameRate } from '../../src/viewer/fbxFrameRate'
const read = (text: string) => readFbxFrameRate(new TextEncoder().encode(text).buffer)
for (const [mode, fps] of [[11,24],[9,30000/1001],[6,30],[17,60000/1001],[3,60],[13,24000/1001],[4,50]]) {
  test(`TimeMode ${mode} retains its time base rather than key density`, () => {
    expect(read(`GlobalSettings: { Properties70: { P: "TimeMode", "enum", "", "",${mode} } }`)).toMatchObject({ fps, fallback: false })
  })
}
test('legacy settings, custom FPS and explicit fallback', () => {
  expect(read('Settings: { TimeMode: 3 FrameRate: "30" }')).toMatchObject({ fps: 30, fallback: false })
  expect(read('Settings: { FrameRate: "29.97" }')).toMatchObject({ fps: 30000/1001, fallback: false })
  expect(read('Version5: { Settings: { FrameRate: 60 } }')).toMatchObject({ fps: 60, fallback: false })
  expect(read('GlobalSettings: { Properties60: { Property: "TimeMode", "enum", "", 14\nProperty: "CustomFrameRate", "double", "", 48 } }')).toMatchObject({ fps: 48, fallback: false })
  for (const text of ['', 'Objects: { Model: { FrameRate: 60 } }', 'GlobalSettings: { TimeMode: 0 }', 'Settings: { FrameRate: -1 }', 'GlobalSettings: { TimeMode: 14 }']) expect(read(text)).toMatchObject({ fps: 30, fallback: true })
})
function binary(version: number, legacy: boolean) {
  const wide = version >= 7500, h = wide ? 25 : 13
  const bytes: number[] = Array.from(new TextEncoder().encode('Kaydara FBX Binary  \0\x1a\0'))
  bytes.push(...new Uint8Array(new Uint32Array([version]).buffer))
  const node = (name: string, props: (number|string)[], children: () => void) => {
    const offset = bytes.length
    bytes.push(...Array(h).fill(0), ...new TextEncoder().encode(name))
    const begin = bytes.length
    for (const p of props) {
      if (typeof p === 'number') bytes.push(73, ...new Uint8Array(new Int32Array([p]).buffer))
      else { const b = new TextEncoder().encode(p); bytes.push(83, ...new Uint8Array(new Uint32Array([b.length]).buffer), ...b) }
    }
    const length = bytes.length - begin
    children(); bytes.push(...Array(h).fill(0))
    const record = new Uint8Array(h), view = new DataView(record.buffer)
    if (wide) { view.setBigUint64(0, BigInt(bytes.length), true); view.setBigUint64(8, BigInt(props.length), true); view.setBigUint64(16, BigInt(length), true) }
    else { view.setUint32(0, bytes.length, true); view.setUint32(4, props.length, true); view.setUint32(8, length, true) }
    record[h-1] = name.length
    bytes.splice(offset, h, ...record)
  }
  if (legacy) node('Settings', [], () => node('FrameRate', ['59.94'], () => {}))
  else node('GlobalSettings', [], () => node('Properties70', [], () => node('P', ['TimeMode','enum','','',11], () => {})))
  bytes.push(...Array(h).fill(0))
  return new Uint8Array(bytes).buffer
}
for (const version of [6000,7400,7500]) test(`binary metadata ${version} and corruption`, () => {
  const b = binary(version, version === 6000)
  expect(readFbxFrameRate(b)).toMatchObject({ fps: version === 6000 ? 60000/1001 : 24, fallback: false })
  expect(readFbxFrameRate(b.slice(0,40)).fallback).toBe(true)
})
test('oversized ASCII mesh arrays do not hide trailing legacy settings', () => {
  expect(read(`Objects: {\nVertices: *99999 {\na: ${'0,'.repeat(100000)}\n}\n}\nVersion5: { Settings: { FrameRate: 24 } }`)).toMatchObject({ fps: 24, fallback: false })
})
test.skipIf(!process.env.FBX_LEGACY_SAMPLE)('local production metadata can be read without uploading', () => {
  const bytes = readFileSync(process.env.FBX_LEGACY_SAMPLE!)
  const result = readFbxFrameRate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  expect(result.fps).toBeGreaterThan(0)
  expect(result).toMatchObject({ fps: 30, fallback: false })
})

test('legacy GlobalSettings nested under Objects is respected', () => {
  const data = readFileSync('tests/fixtures/legacy/maya_game_sausage_6100_ascii_combined.fbx')
  expect(readFbxFrameRate(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))).toMatchObject({ fps: 24, fallback: false })
  expect(read('Objects: { GlobalSettings: { Properties60: { Property: "TimeMode", "enum", "", 11 } } }')).toMatchObject({ fps: 24, fallback: false })
})
