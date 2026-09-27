import { applyExportProjection } from './exportCamera'
import { FRAME_GUIDES } from '../utils/frameGuide'
import type { FrameGuideMode } from '../utils/frameGuide'
import { BurnInRenderer } from '../overlay/BurnInRenderer'
import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer, PCFShadowMap, Vector2 } from 'three'
import { INITIAL_SNAPSHOT } from '../types/viewer'
import type { ViewerSnapshot } from '../types/viewer'
import { AssetInstance } from './AssetInstance'
import { CameraController, assetBounds, fitCamera } from './CameraController'
import { disposeAsset } from './disposeAsset'
import { loadFbx, validateFile } from './FbxAssetLoader'
import { FollowController, findFollowTarget } from './FollowController'
import { GroundShadow } from './GroundShadow'
import { InfiniteGrid } from './InfiniteGrid'
import { chooseVideoDestination, saveExportedVideo, videoFileName } from '../export/saveExportedVideo'
import { exportSize } from '../utils/exportTiming'
import type { VideoDestination } from '../export/saveExportedVideo'
import type { ExportResolution } from '../utils/exportTiming'
import { FRAME_RATES, timeAtFrame } from '../utils/frameTime'

export class ViewerEngine {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(42, 1, 0.01, 100000)
  private readonly navigation: CameraController
  private readonly resizeObserver: ResizeObserver
  private readonly grid = new InfiniteGrid()
  private readonly follow: FollowController
  private readonly ground: GroundShadow
  private readonly burnIn = new BurnInRenderer()
  private exportAbort: AbortController | null = null
  private asset: AssetInstance | null = null
  private state: ViewerSnapshot = { ...INITIAL_SNAPSHOT }
  private disposed = false
  private loadingGeneration = 0
  private loadAbort: AbortController | null = null
  private lastTime = 0
  private lastPublish = 0
  private fpsStart = 0
  private fpsFrames = 0

  constructor(private readonly container: HTMLElement, private readonly publish: (state: ViewerSnapshot) => void) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(new Color('#1c232b'))
    this.renderer.domElement.setAttribute('aria-label', '3D viewport. Alt and drag to navigate. F to fit.')
    this.renderer.domElement.tabIndex = 0
    container.append(this.renderer.domElement)
    this.camera.position.set(350, 230, 420)
    this.navigation = new CameraController(this.camera, this.renderer.domElement)
    this.follow = new FollowController(this.camera, this.navigation.controls.target)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    const key = new DirectionalLight(0xfff1df, 2.7)
    key.position.set(3, 6, 4)
    const fill = new DirectionalLight(0xadcaff, 1.6)
    fill.position.set(-4, 2, -3)
    this.scene.add(new HemisphereLight(0xd4e5ff, 0x535965, 2), key, fill, this.grid)
    this.ground = new GroundShadow(this.scene, key)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    document.addEventListener('visibilitychange', this.visibilityChanged)
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextRestored)
    this.renderer.setAnimationLoop(this.render)
  }

  private resize() {
    if (this.state.exporting) return
    const { width, height } = this.container.getBoundingClientRect()
    this.renderer.setSize(Math.max(1, width), Math.max(1, height))
    this.camera.aspect = Math.max(1, width) / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }
  private visibilityChanged = () => { this.lastTime = 0 }
  private contextLost = (event: Event) => {
    event.preventDefault()
    this.exportAbort?.abort()
    if (this.asset) this.asset.playback.playing = false
    this.state.error = 'The GPU context was lost. Waiting for recovery; reload the page if it does not recover.'
    this.emit()
  }
  private contextRestored = () => { this.state.error = null; this.lastTime = 0; this.emit() }

  private render = (timestamp: number) => {
    if (this.disposed || this.state.exporting) return
    const delta = this.lastTime ? (timestamp - this.lastTime) / 1000 : 0
    this.lastTime = timestamp
    const wrapped = !document.hidden && this.asset?.playback.advance(delta)
    this.updatePose(!!wrapped)
    this.renderer.render(this.scene, this.camera)
    this.drawBurnIn()
    this.fpsFrames++
    if (timestamp - this.fpsStart >= 500) {
      this.state.renderFps = this.fpsFrames * 1000 / (timestamp - this.fpsStart)
      this.fpsFrames = 0
      this.fpsStart = timestamp
    }
    if (timestamp - this.lastPublish >= 50) {
      this.emit()
      this.lastPublish = timestamp
    }
  }

  private emit() {
    if (this.disposed) return
    const playback = this.asset?.playback
    this.state = { ...this.state, time: playback?.time ?? 0, duration: playback?.duration ?? 0, playing: playback?.playing ?? false }
    this.publish(this.state)
  }

  async load(file: File) {
    if (this.state.loading || this.state.exporting || this.disposed) return
    const generation = ++this.loadingGeneration
    const abort = new AbortController()
    this.loadAbort = abort
    try { validateFile(file) } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'Invalid file.'
      this.emit()
      return
    }
    if (this.asset) this.asset.playback.playing = false
    this.state = { ...this.state, loading: true, pendingName: file.name, error: null }
    this.emit()
    // Let the loading message paint before the synchronous FBX parser starts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    try {
      const { root, warnings, frameRate } = await loadFbx(file, abort.signal)
      if (this.disposed || generation !== this.loadingGeneration) { disposeAsset(root); return }
      let next: AssetInstance
      try { next = new AssetInstance(root, file, warnings) } catch (error) { disposeAsset(root); throw error }
      this.asset?.dispose()
      this.asset = next
      next.info.frameRate = frameRate
      this.asset.playback.fps = this.state.fps
      this.asset.playback.loop = this.state.loop
      this.asset.playback.speed = this.state.speed
      this.asset.setXRay(this.state.xray)
      this.asset.setMeshVisible(this.state.meshVisible)
      this.asset.helper.visible = this.state.boneVisible
      this.scene.add(root, this.asset.helper)
      this.state = { ...this.state, asset: this.asset.info, clipIndex: root.animations.length ? 0 : -1 }
      this.follow.attach(findFollowTarget(root, root.animations[0]))
      this.follow.setMode(this.state.follow ? 'ground' : 'off')
      if (this.state.fitEnabled) this.fit()
      const bounds = assetBounds(root)
      this.ground.configure(root, bounds, this.follow.position())
      this.ground.setEnabled(this.state.shadow)
      if (!bounds.isEmpty()) {
        const extent = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z, 1)
        this.grid.configure({ spacing: 10 ** Math.ceil(Math.log10(extent)) / 10, height: this.ground.plane.position.y })
      }
    } catch (error) {
      if (!this.disposed && generation === this.loadingGeneration && !abort.signal.aborted) this.state.error = error instanceof Error ? error.message : 'Could not load this FBX.'
    } finally {
      if (!this.disposed && generation === this.loadingGeneration) {
        this.state = { ...this.state, loading: false, pendingName: '' }
        this.lastTime = 0
        this.emit()
      }
    }
  }

  cancelLoad() {
    this.loadAbort?.abort()
    this.loadAbort = null
    this.loadingGeneration++
    this.state = { ...this.state, loading: false, pendingName: '' }
    this.emit()
  }

  private updatePose(discontinuity = false) {
    if (discontinuity && this.asset) {
      // Evaluate the exact start before fitting, then apply the wrapped remainder.
      const wrappedTime = this.asset.playback.time
      this.asset.playback.seek(0)
      if (this.state.fitEnabled) this.fit()
      else this.follow.rebaseLoopPreservingComposition()
      this.follow.resetFollowReferenceWithoutMovingCamera()
      this.asset.playback.seek(wrappedTime)
      this.follow.update()
    } else this.follow.update(discontinuity)
    this.ground.update(this.follow.position())
  }
  fit() {
    if (this.asset && !this.disposed && !this.state.exporting) {
      this.navigation.fit(this.asset.root, this.guideAspect())
      this.follow.resetFollowReferenceWithoutMovingCamera()
    }
  }
  togglePlay() { if (!this.state.loading && !this.state.exporting) { this.asset?.playback.toggle(); this.updatePose(); this.lastTime = 0; this.emit() } }
  step(direction: -1 | 1) { if (!this.state.loading && !this.state.exporting) { this.asset?.playback.step(direction); this.updatePose(); this.emit() } }
  seekFrame(frame: number) {
    if (!this.asset || this.state.loading || this.state.exporting) return
    this.asset.playback.playing = false
    this.asset.playback.seek(timeAtFrame(Math.round(frame), this.state.fps, this.state.startFrame))
    this.updatePose()
    this.emit()
  }
  setFps(fps: number) {
    if (this.state.exporting) return
    if (!FRAME_RATES.some((entry) => entry.value === fps)) return
    this.state.fps = fps
    if (this.asset) this.asset.playback.fps = fps
    this.emit()
  }
  setLoop(loop: boolean) {
    if (this.state.exporting) return
    this.state.loop = loop
    if (this.asset) this.asset.playback.loop = loop
    this.emit()
  }
  selectClip(index: number) {
    if (!this.asset || !this.asset.root.animations[index] || this.state.loading || this.state.exporting) return
    this.asset.playback.select(this.asset.root.animations[index])
    this.follow.attach(findFollowTarget(this.asset.root, this.asset.root.animations[index]))
    this.ground.configure(this.asset.root, assetBounds(this.asset.root), this.follow.position())
    this.grid.configure({ height: this.ground.plane.position.y })
    this.state.clipIndex = index
    this.lastTime = 0
    this.emit()
  }
  setVisibility(kind: 'meshVisible' | 'boneVisible' | 'gridVisible', visible: boolean) {
    if (this.state.exporting) return
    this.state[kind] = visible
    this.asset?.setMeshVisible(this.state.meshVisible)
    if (this.asset) this.asset.helper.visible = this.state.boneVisible
    this.grid.visible = this.state.gridVisible
    this.emit()
  }
  setSpeed(speed: number) {
    if (this.state.exporting || ![0.25, 0.5, 1, 2].includes(speed)) return
    this.state.speed = speed
    if (this.asset) this.asset.playback.speed = speed
    this.emit()
  }
  setXRay(enabled: boolean) {
    if (this.state.exporting) return
    this.state.xray = enabled; this.asset?.setXRay(enabled); this.emit()
  }
  setShadow(enabled: boolean) {
    if (this.state.exporting) return
    this.state.shadow = enabled; this.ground.setEnabled(enabled); this.emit()
  }
  setFitEnabled(enabled: boolean) {
    if (this.state.exporting || this.state.loading || this.disposed || enabled === this.state.fitEnabled) return
    if (enabled) this.fit()
    this.state.fitEnabled = enabled
    this.emit()
  }
  setFollow(enabled: boolean) {
    if (this.state.exporting || this.state.loading || this.disposed || enabled === this.state.follow) return
    if (enabled && this.state.fitEnabled) this.fit()
    this.state.follow = enabled; this.follow.setMode(enabled ? 'ground' : 'off'); this.emit()
  }
  private guideAspect() { return this.state.frameGuide === 'off' ? undefined : FRAME_GUIDES[this.state.frameGuide] }
  setFrameGuide(mode: FrameGuideMode) {
    if (this.state.exporting || (mode !== 'off' && !(mode in FRAME_GUIDES))) return
    this.state.frameGuide = mode
    this.drawBurnIn()
    this.emit()
  }
  setBurnIn(enabled: boolean) {
    if (this.state.exporting) return
    this.state.burnIn = enabled
    this.drawBurnIn()
    this.emit()
  }
  private burnInData() {
    return { name: this.asset?.info.name ?? '', time: this.asset?.playback.time ?? 0,
      duration: this.asset?.playback.duration ?? 0, fps: this.state.fps, startFrame: this.state.startFrame }
  }
  private drawBurnIn() {
    const settings = { filename: this.state.burnIn, frame: this.state.burnIn }
    if (!this.asset || (!settings.filename && !settings.frame)) { this.burnIn.canvas.remove(); return }
    if (!this.burnIn.canvas.isConnected) this.container.append(this.burnIn.canvas)
    const canvas = this.renderer.domElement
    this.burnIn.draw(canvas.width, canvas.height, settings, this.burnInData(), undefined, this.guideAspect())
  }
  // Used only on the isolated Batch engine, never on the user's live Viewer.
  prepareBatch(burnIn: boolean) {
    if (!this.asset || this.state.error) throw new Error(this.state.error || 'Could not load this FBX.')
    if (!(this.asset.playback.duration > 0)) throw new Error('The default take has no animation.')
    const frameRate = this.asset.info.frameRate!
    this.state.fps = frameRate.fps
    this.asset.playback.fps = frameRate.fps
    this.setFitEnabled(true)
    this.setBurnIn(burnIn)
    this.setFrameGuide('16:9')
    this.setFollow(true)
    return { frameRate, duration: this.asset.playback.duration }
  }
  suspendRendering(suspended: boolean) {
    this.renderer.setAnimationLoop(suspended ? null : this.render)
    this.lastTime = 0
  }
  cancelExport() { this.exportAbort?.abort() }

  async exportMovie(resolution: ExportResolution, destinationOverride?: VideoDestination) {
    if (!this.asset || this.state.loading || this.state.exporting || this.asset.playback.duration <= 0 || this.disposed) return
    const asset = this.asset
    const playback = asset.playback
    const saved = {
      time: playback.time, playing: playback.playing, fitEnabled: this.state.fitEnabled, following: this.state.follow,
      follow: this.follow.snapshot(), subjectPosition: this.follow.position(), camera: this.camera.clone(),
      target: this.navigation.controls.target.clone(), controls: this.navigation.controls.enabled,
      size: this.renderer.getSize(new Vector2()), ratio: this.renderer.getPixelRatio(),
    }
    const size = exportSize(resolution, this.renderer.domElement.width, this.renderer.domElement.height)
    const abort = new AbortController()
    this.exportAbort = abort
    this.state = { ...this.state, exporting: true, exportProgress: 0, exportStatus: 'Choose save location…', error: null }
    playback.playing = false
    this.navigation.controls.enabled = false
    this.emit()
    // Export owns its camera and Follow history; the live camera is never fitted here.
    const camera = saved.camera.clone()
    const followTarget = saved.target.clone()
    const follow = new FollowController(camera, followTarget)
    follow.attach(findFollowTarget(asset.root, asset.root.animations[this.state.clipIndex]))
    follow.setMode(saved.follow.mode)
    let composite: BurnInRenderer | undefined
    try {
      const destination = destinationOverride ?? await chooseVideoDestination(videoFileName(asset.info.name))
      abort.signal.throwIfAborted()
      playback.seek(0)
      if (saved.fitEnabled) fitCamera(camera, followTarget, asset.root, resolution !== 'viewport' ? size.width / size.height : undefined)
      else if (saved.follow.mode !== 'off') follow.rebaseExportFrom(saved.subjectPosition)
      follow.resetFollowReferenceWithoutMovingCamera()
      applyExportProjection(camera, size.width / size.height, resolution !== 'viewport')
      const { renderPreview } = await import('../export/PreviewExporter')
      abort.signal.throwIfAborted()
      this.renderer.setPixelRatio(1)
      this.renderer.setSize(size.width, size.height, false)
      const burnSettings = { filename: this.state.burnIn, frame: this.state.burnIn }
      if (burnSettings.filename || burnSettings.frame) {
        composite = new BurnInRenderer()
        composite.canvas.width = size.width; composite.canvas.height = size.height
      }
      const blob = await renderPreview({
        canvas: composite?.canvas ?? this.renderer.domElement, duration: playback.duration, fps: this.state.fps, signal: abort.signal,
        draw: time => {
          playback.seek(time)
          follow.update()
          this.ground.update(follow.position())
          this.renderer.render(this.scene, camera)
          composite?.draw(size.width, size.height, burnSettings, this.burnInData(), this.renderer.domElement)
        },
        progress: (exportProgress, exportStatus) => {
          this.state = { ...this.state, exportProgress, exportStatus }; this.emit()
        },
      })
      abort.signal.throwIfAborted()
      this.state.exportStatus = 'Saving MP4…'; this.emit()
      await saveExportedVideo(blob, destination, abort.signal)
      this.state.exportStatus = 'Export complete'
    } catch (error) {
      if (!this.disposed) {
        const cancelled = abort.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
        this.state.exportStatus = cancelled ? 'Export cancelled' : 'Export failed'
        if (!cancelled) this.state.error = error instanceof Error ? error.message : 'Could not export preview.'
      }
    } finally {
      composite?.dispose()
      if (!this.disposed) {
        playback.seek(saved.time); playback.playing = saved.playing
        this.state.fitEnabled = saved.fitEnabled; this.state.follow = saved.following
        this.follow.restore(saved.follow)
        this.camera.copy(saved.camera)
        this.navigation.controls.target.copy(saved.target)
        this.navigation.controls.enabled = saved.controls
        this.ground.update(this.follow.position())
        this.renderer.setPixelRatio(saved.ratio)
        this.renderer.setSize(saved.size.x, saved.size.y, false)
        this.state.exporting = false
        const bounds = this.container.getBoundingClientRect()
        if (Math.max(1, bounds.width) !== saved.size.x || Math.max(1, bounds.height) !== saved.size.y) this.resize()
        this.renderer.render(this.scene, this.camera)
        this.drawBurnIn()
        this.lastTime = 0
        this.emit()
      }
      this.exportAbort = null
    }
  }
  dispose() {
    this.disposed = true
    this.exportAbort?.abort()
    this.burnIn.dispose()
    this.ground.dispose()
    this.loadAbort?.abort()
    this.loadingGeneration++
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.navigation.dispose()
    document.removeEventListener('visibilitychange', this.visibilityChanged)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextRestored)
    this.asset?.dispose()
    this.grid.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}
