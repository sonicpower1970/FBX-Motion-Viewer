// Original, minimal ASCII FBX fixtures. No production/customer motion data.
const identity = '1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1'
const header = `; FBX 7.4.0 project-owned test fixture
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
}
GlobalSettings:  {
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",1
\t}
}
`

function model(id: number, name: string, type: string, y: number) {
  return `\tModel: ${id}, "Model::${name}", "${type}" {
\t\tVersion: 232
\t\tProperties70:  {
\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,${y},0
\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0
\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
\t\t}
\t}
`
}

function animation(id: number, name: string, start: number, duration: number, peak: number) {
  const tick = 46186158000
  return `\tAnimationStack: ${id}, "AnimStack::${name}", "" {
\t\tProperties70:  {
\t\t\tP: "LocalStart", "KTime", "Time", "",${start * tick}
\t\t\tP: "LocalStop", "KTime", "Time", "",${(start + duration) * tick}
\t\t}
\t}
\tAnimationLayer: ${id + 1}, "AnimLayer::BaseLayer", "" {
\t}
\tAnimationCurveNode: ${id + 2}, "AnimCurveNode::T", "" {
\t\tProperties70:  {
\t\t\tP: "d|X", "Number", "", "A",0
\t\t\tP: "d|Y", "Number", "", "A",0
\t\t\tP: "d|Z", "Number", "", "A",0
\t\t}
\t}
\tAnimationCurve: ${id + 3}, "AnimCurve::", "" {
\t\tKeyTime: *3 {
\t\t\ta: ${start * tick},${(start + duration / 2) * tick},${(start + duration) * tick}
\t\t}
\t\tKeyAttrFlags: *1 {
\t\t\ta: 4
\t\t}
\t\tKeyAttrDataFloat: *4 {
\t\t\ta: 0,0,0,0
\t\t}
\t\tKeyAttrRefCount: *1 {
\t\t\ta: 3
\t\t}
\t\tKeyValueFloat: *3 {
\t\t\ta: 0,${peak},0
\t\t}
\t}
`
}
function animationConnections(id: number) {
  return `\tC: "OO",${id + 1},${id}
\tC: "OO",${id + 2},${id + 1}
\tC: "OP",${id + 2},1,"Lcl Translation"
\tC: "OP",${id + 3},${id + 2},"d|X"
`
}

export function makeFbx({ mesh = false, animated = true, texture = '', embedded = '' } = {}) {
  let objects = model(1, 'Root', 'LimbNode', 0) + model(2, 'Chest', 'LimbNode', 80) + model(3, 'Tip', 'LimbNode', 60)
  let connections = '\tC: "OO",1,0\n\tC: "OO",2,1\n\tC: "OO",3,2\n'
  if (animated) {
    objects += animation(100, 'Travel', 0, 2, 80) + animation(200, 'Return', 1, 1, -40)
    connections += animationConnections(100) + animationConnections(200)
  }
  if (mesh) {
    objects += model(10, 'SkinnedRibbon', 'Mesh', 0)
    objects += `\tGeometry: 11, "Geometry::Ribbon", "Mesh" {
\t\tVertices: *18 {
\t\t\ta: -25,0,0,25,0,0,-25,80,0,25,80,0,-25,140,0,25,140,0
\t\t}
\t\tPolygonVertexIndex: *12 {
\t\t\ta: 0,1,-3,1,3,-3,2,3,-5,3,5,-5
\t\t}
\t\tLayerElementUV: 0 {
\t\t\tMappingInformationType: "ByVertice"
\t\t\tReferenceInformationType: "Direct"
\t\t\tUV: *12 {
\t\t\t\ta: 0,0,1,0,0,0.5,1,0.5,0,1,1,1
\t\t\t}
\t\t}
\t}
\tMaterial: 12, "Material::Neutral", "" {
\t\tVersion: 102
\t\tShadingModel: "phong"
\t\tProperties70:  {
\t\t\tP: "DiffuseColor", "Color", "", "A",0.45,0.7,0.75
\t\t}
\t}
\tDeformer: 20, "Deformer::Skin", "Skin" {
\t\tVersion: 101
\t}
\tDeformer: 21, "SubDeformer::Root", "Cluster" {
\t\tIndexes: *6 {
\t\t\ta: 0,1,2,3,4,5
\t\t}
\t\tWeights: *6 {
\t\t\ta: 1,1,1,1,1,1
\t\t}
\t\tTransform: *16 {
\t\t\ta: ${identity}
\t\t}
\t\tTransformLink: *16 {
\t\t\ta: ${identity}
\t\t}
\t}
`
    connections += '\tC: "OO",10,0\n\tC: "OO",11,10\n\tC: "OO",12,10\n\tC: "OO",20,11\n\tC: "OO",21,20\n\tC: "OO",1,21\n'
    if (texture) {
      objects += `\tTexture: 30, "Texture::Missing", "" {
\t\tType: "TextureVideoClip"
\t\tFileName: "${texture}"
\t\tRelativeFilename: "${texture}"
\t}
\tVideo: 31, "Video::Image", "Clip" {
\t\tFilename: "${texture}"
\t\tRelativeFilename: "${texture}"
${embedded ? `\t\tContent: ,\n\t\t\t"${embedded}"\n` : ''}\t}
`
      connections += '\tC: "OP",30,12,"DiffuseColor"\n\tC: "OO",31,30\n'
    }
  }
  return `${header}Objects:  {\n${objects}}\nConnections:  {\n${connections}}\n`
}
