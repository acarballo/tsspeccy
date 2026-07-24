import { CPU }                    from '../cpu/CPU.js'
import { ULA, TSTATES_PER_FRAME } from './ULA.js'
import { Renderer }               from './Renderer.js'
import { Beeper }                 from '../audio/Beeper.js'
import { IOBus }                  from '../io/IOBus.js'
import { TapePlayer }             from '../tape/TapePlayer.js'

/**
 * FrameLoop
 *
 * Runs the emulator at exactly 50 Hz using a wall-clock scheduler.
 *
 * Problem with naive requestAnimationFrame:
 *   - rAF fires at 60 Hz on modern displays
 *   - Each call executes one Spectrum frame (69888 T-states)
 *   - Result: emulator runs at 60/50 = 120% real speed
 *
 * Solution: track real elapsed time with performance.now().
 *   - Target: one frame every FRAME_MS = 1000/50 = 20ms
 *   - Each rAF tick computes how many frames are due and runs them
 *   - If we're behind, we catch up (up to MAX_CATCHUP frames)
 *   - If we're ahead, we skip rendering and wait for next tick
 *
 * Speed control:
 *   - speedFactor = 1.0 → real ZX Spectrum speed (50 Hz)
 *   - speedFactor = 2.0 → double speed (fast loading)
 *   - speedFactor = 0.5 → half speed (slow motion)
 */

const FRAMES_PER_SECOND = 50
const FRAME_MS          = 1000 / FRAMES_PER_SECOND  // 20ms per frame
const MAX_CATCHUP       = 4    // never run more than this many frames per tick

export class FrameLoop {
  private running     = false
  private rafId       = 0
  private lastTime    = 0       // performance.now() of last tick
  private frameDebt   = 0       // accumulated ms we owe

  /** Speed multiplier: 1.0 = normal, 2.0 = double, 0.5 = half */
  speedFactor = 1.0

  // ── Real FPS counter ─────────────────────────────────────────────
  private fpsFrameCount = 0
  private fpsWindowStart = 0
  /** Frames per second measured over the last second. Updated each second. */
  fps = 0

  constructor(
    private readonly cpu:      CPU,
    private readonly ula:      ULA,
    private readonly renderer: Renderer,
    private readonly beeper:   Beeper,
    private readonly io:       IOBus,
    private readonly tape:     TapePlayer,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Fast-boot: run silently until ROM init done
  // ─────────────────────────────────────────────────────────────────

  fastBoot(maxFrames = 150): void {
    for (let f = 0; f < maxFrames; f++) {
      this.cpu.interrupt()
      let t = 0
      while (t < TSTATES_PER_FRAME) t += this.cpu.step()
      if (this.cpu.regs.IFF1 && this.cpu.regs.IM === 1) break
    }
    this.ula.renderFrame()
    this.renderer.drawFrame()
  }

  // ─────────────────────────────────────────────────────────────────
  // Turbo load: run tape at max speed without rendering/audio
  //
  // Executes CPU frames as fast as possible until tape finishes.
  // Work is split into ~50ms chunks via setTimeout to keep the
  // browser responsive and allow UI updates between chunks.
  //
  // onProgress(blockIndex, totalBlocks) — called after each chunk
  // onDone()                            — called when tape finishes
  // ─────────────────────────────────────────────────────────────────

  /** Max real-time ms to spend per chunk before yielding to browser */
  private static readonly TURBO_CHUNK_MS = 50

  /** Max frames to run in turbo mode (safety limit ~5 minutes of tape) */
  private static readonly TURBO_MAX_FRAMES = 50 * 60 * 5

  turboLoad(
    onProgress?: (block: number, total: number, description: string) => void,
    onDone?: () => void,
  ): void {
    if (!this.tape.isLoaded()) { onDone?.(); return }

    // Pause normal loop during turbo — we drive CPU ourselves
    const wasRunning = this.running
    if (wasRunning) this.stop()

    // Ensure tape is playing
    if (this.tape.state !== 'playing') this.tape.play()

    let framesRun = 0

    const runChunk = (): void => {
      const chunkStart = performance.now()

      while (true) {
        // Check tape finished
        if (this.tape.state === 'finished' || this.tape.state === 'stopped') {
          this.ula.renderFrame()
          this.renderer.drawFrame()
          if (wasRunning) this.start()
          onDone?.()
          return
        }

        // Safety limit
        if (framesRun >= FrameLoop.TURBO_MAX_FRAMES) {
          if (wasRunning) this.start()
          onDone?.()
          return
        }

        // Run one frame silently (no beeper, no render)
        this.cpu.interrupt()
        let t = 0
        while (t < TSTATES_PER_FRAME) {
          const stepped = this.cpu.step()
          this.tape.advanceTstates(stepped)
          t += stepped
        }
        framesRun++

        // Yield to browser every TURBO_CHUNK_MS of real time
        if (performance.now() - chunkStart >= FrameLoop.TURBO_CHUNK_MS) {
          // Report progress
          const block = (this.tape as any).blockIndex as number ?? 0
          onProgress?.(block, this.tape.totalBlocks(), this.tape.currentBlock()?.description ?? '')
          // Render current frame so user can see loading progress
          this.ula.renderFrame()
          this.renderer.drawFrame()
          // Schedule next chunk
          setTimeout(runChunk, 0)
          return
        }
      }
    }

    setTimeout(runChunk, 0)
  }

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return
    this.running  = true
    this.lastTime = performance.now()
    this.fpsWindowStart = performance.now()
    this.fpsFrameCount = 0
    this.fps = 0
    this.frameDebt = 0
    this.beeper.start()
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.beeper.stop()
  }

  isRunning(): boolean { return this.running }

  // ─────────────────────────────────────────────────────────────────
  // Main loop tick — called by rAF (60 Hz on most displays)
  // ─────────────────────────────────────────────────────────────────

  private tick = (now: number): void => {
    if (!this.running) return

    this.beeper.resume()

    // How much real time has passed since last tick?
    const elapsed = now - this.lastTime
    this.lastTime = now

    // Clamp elapsed to avoid huge catch-up after tab switch / breakpoint
    const clampedElapsed = Math.min(elapsed, FRAME_MS * MAX_CATCHUP)

    // Accumulate debt at the requested speed
    this.frameDebt += clampedElapsed * this.speedFactor

    // Run as many emulated frames as the debt allows
    let framesRun = 0
    while (this.frameDebt >= FRAME_MS && framesRun < MAX_CATCHUP) {
      this.runOneFrame()
      this.frameDebt -= FRAME_MS
      framesRun++
    }

    // Always render after running (even if 0 frames ran, keep display alive)
    if (framesRun > 0) {
      this.ula.renderFrame()
      this.renderer.drawFrame()
      this.fpsFrameCount += framesRun
    }

    // Update FPS once per second of real time
    const elapsedReal = now - this.fpsWindowStart
    if (elapsedReal >= 1000) {
      this.fps = Math.round(this.fpsFrameCount * 1000 / elapsedReal)
      this.fpsFrameCount = 0
      this.fpsWindowStart = now
    }

    this.rafId = requestAnimationFrame(this.tick)
  }

  // ─────────────────────────────────────────────────────────────────
  // Execute exactly one emulated frame (69888 T-states)
  // ─────────────────────────────────────────────────────────────────

  private runOneFrame(): void {
    this.cpu.interrupt()

    let tStates = 0
    while (tStates < TSTATES_PER_FRAME) {
      this.io.currentTstate = tStates
      const stepped = this.cpu.step()
      this.tape.advanceTstates(stepped)
      tStates += stepped
    }

    this.beeper.endFrame(tStates)
  }
}
