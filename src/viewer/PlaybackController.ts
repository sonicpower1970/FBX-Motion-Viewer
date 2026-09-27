import { AnimationMixer, LoopOnce } from 'three'
import type { AnimationAction, AnimationClip, Object3D } from 'three'
import { clamp, steppedTime } from '../utils/frameTime'

export class PlaybackController {
  readonly mixer: AnimationMixer
  private action: AnimationAction | null = null
  time = 0
  duration = 0
  playing = false
  loop = true
  fps = 30
  speed = 1

  constructor(private readonly root: Object3D) { this.mixer = new AnimationMixer(root) }

  select(clip?: AnimationClip) {
    this.mixer.stopAllAction()
    this.time = 0
    this.playing = false
    this.duration = Math.max(0, clip?.duration ?? 0)
    this.action = clip ? this.mixer.clipAction(clip) : null
    if (this.action) {
      this.action.reset().setLoop(LoopOnce, 1).play()
      this.action.clampWhenFinished = true
    }
    this.evaluate()
  }

  private evaluate() {
    if (this.action) {
      // Playback speed/pause is owned by this clock, not mixer.timeScale.
      // Re-enable an action that reached LoopOnce's endpoint before seeking back.
      this.action.paused = false
      this.action.enabled = true
      this.mixer.setTime(this.time)
    }
    this.root.updateMatrixWorld(true)
  }

  seek(time: number) {
    if (!Number.isFinite(time)) return
    this.time = clamp(time, 0, this.duration)
    this.evaluate()
  }

  step(direction: -1 | 1) {
    this.playing = false
    this.seek(steppedTime(this.time, direction, this.duration, this.fps))
  }

  toggle() {
    if (this.duration <= 0) return
    if (!this.playing && this.time >= this.duration) this.seek(0)
    this.playing = !this.playing
  }

  advance(delta: number) {
    if (!this.playing || this.duration <= 0 || !Number.isFinite(delta) || delta < 0) return false
    const next = this.time + delta * this.speed
    if (next >= this.duration) {
      if (this.loop) { this.seek(next % this.duration); return true }
      else { this.seek(this.duration); this.playing = false }
    } else this.seek(next)
    return false
  }

  dispose() {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.mixer.getRoot())
  }
}
