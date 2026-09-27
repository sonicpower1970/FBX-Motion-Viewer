export interface LegacyNode { name: string; parent: number; bone: boolean; trs: number[] }
export interface LegacyMaterial { name: string; color: number[]; textured: boolean; filename: string; content: Uint8Array<ArrayBuffer>; uv: number[] }
export interface LegacyMesh {
  node: number; position: Float32Array; normal: Float32Array; uv: Float32Array
  skinIndex: Uint32Array; skinWeight: Float32Array; materials: Uint32Array
  bones: Uint32Array; inverse: Float32Array
}
export interface LegacyTrack { node: number; type: number; times: Float32Array; values: Float32Array }
export interface LegacyScene {
  nodes: LegacyNode[]; materials: LegacyMaterial[]; meshes: LegacyMesh[]
  clips: { name: string; duration: number; tracks: LegacyTrack[] }[]; warnings: string[]
}
export interface UfbxModule {
  HEAPU8: Uint8Array; result: LegacyScene; error?: string
  _malloc(size: number): number; _free(ptr: number): void; _convert(ptr: number, length: number): number
}
