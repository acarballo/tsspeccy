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
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  start(): void {
    if (this.running) return
    this.running  = true
    this.lastTime = performance.now()
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
