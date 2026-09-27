import { Color, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, ShaderMaterial } from 'three'

export interface GridSettings { spacing: number; majorInterval: number; fadeDistance: number; height: number }

/** A screen quad intersects viewing rays with the Y-up ground: no finite world geometry. */
export class InfiniteGrid extends Mesh<PlaneGeometry, ShaderMaterial> {
  readonly settings: GridSettings = { spacing: 50, majorInterval: 10, fadeDistance: 0, height: 0 }
  constructor() {
    super(new PlaneGeometry(2, 2), new ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: {
        inverseProjection: { value: new Matrix4() }, cameraWorld: { value: new Matrix4() },
        viewProjection: { value: new Matrix4() }, groundHeight: { value: 0 },
        spacing: { value: 50 }, majorInterval: { value: 10 }, fadeDistance: { value: 10000 },
        minorColor: { value: new Color('#465361') }, majorColor: { value: new Color('#758492') },
      },
      vertexShader: `
        uniform mat4 inverseProjection, cameraWorld;
        varying vec3 nearPoint, farPoint;
        vec3 unproject(float z) {
          vec4 p = cameraWorld * inverseProjection * vec4(position.xy, z, 1.0);
          return p.xyz / p.w;
        }
        void main() {
          nearPoint = unproject(-1.0); farPoint = unproject(1.0);
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform mat4 viewProjection;
        uniform float groundHeight, spacing, majorInterval, fadeDistance;
        uniform vec3 minorColor, majorColor;
        varying vec3 nearPoint, farPoint;
        float line(vec2 p) {
          vec2 width = max(fwidth(p), vec2(0.00001));
          vec2 distanceToLine = abs(fract(p - 0.5) - 0.5) / width;
          float coverage = 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
          return coverage * (1.0 - smoothstep(0.5, 2.0, max(width.x, width.y)));
        }
        void main() {
          vec3 ray = farPoint - nearPoint;
          if (abs(ray.y) < 0.000001) discard;
          float t = (groundHeight - nearPoint.y) / ray.y;
          if (t <= 0.0 || t >= 1.0) discard;
          vec3 p = nearPoint + t * ray;
          vec4 clip = viewProjection * vec4(p, 1.0);
          float depth = clip.z / clip.w * 0.5 + 0.5;
          if (depth < 0.0 || depth > 1.0) discard;
          float minor = line(p.xz / spacing);
          float major = line(p.xz / (spacing * majorInterval));
          float fade = 1.0 - smoothstep(fadeDistance * 0.3, fadeDistance, distance(p, cameraPosition));
          float alpha = max(minor * 0.55, major * 0.85) * fade;
          if (alpha < 0.003) discard;
          gl_FragDepth = depth;
          gl_FragColor = vec4(mix(minorColor, majorColor, major), alpha);
          #include <colorspace_fragment>
        }`,
    }))
    this.frustumCulled = false
    this.renderOrder = -2
    this.onBeforeRender = (_renderer, _scene, camera) => {
      const u = this.material.uniforms
      u.inverseProjection.value.copy(camera.projectionMatrixInverse)
      u.cameraWorld.value.copy(camera.matrixWorld)
      u.viewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      u.groundHeight.value = this.settings.height
      u.spacing.value = Math.max(this.settings.spacing, 0.000001)
      u.majorInterval.value = Math.max(this.settings.majorInterval, 1)
      const height = Math.abs(camera.matrixWorld.elements[13] - this.settings.height)
      const requestedFade = this.settings.fadeDistance > 0 ? this.settings.fadeDistance : Math.max(height * 60, this.settings.spacing * 100)
      u.fadeDistance.value = Math.min(requestedFade, camera instanceof PerspectiveCamera ? camera.far * 0.8 : requestedFade)
    }
  }
  configure(settings: Partial<GridSettings>) { Object.assign(this.settings, settings) }
  dispose() { this.geometry.dispose(); this.material.dispose() }
}
