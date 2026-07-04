import { CPU }                    from '../cpu/CPU.js'
import { ULA, TSTATES_PER_FRAME } from './ULA.js'
import { Renderer }               from './Renderer.js'
import { Beeper }                 from '../audio/Beeper.js'
import { IOBus }                  from '../io/IOBus.js'

/**
 * FrameLoop
 *
 * Runs the emulator at ~50 Hz using requestAnimationFrame.
 * Each tick:
 *   1. Fire maskable INT (ULA pulses /INT once per frame)
 *   2. Execute Z80 for TSTATES_PER_FRAME T-states, updating IOBus.currentTstate
 *   3. Notify Beeper that the frame ended
 *   4. Render ULA frame → canvas
 */
export class FrameLoop {
  private running = false
  private rafId   = 0

  constructor(
    private readonly cpu:      CPU,
    private readonly ula:      ULA,
    private readonly renderer: Renderer,
    private readonly beeper:   Beeper,
    private readonly io:       IOBus,
  ) {}

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

  start(): void {
    if (this.running) return
    this.running = true
    this.beeper.start()
    this.tick()
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.beeper.stop()
  }

  isRunning(): boolean { return this.running }

  private tick = (): void => {
    if (!this.running) return

    this.cpu.interrupt()

    // Resume AudioContext after first user gesture (browsers require this)
    this.beeper.resume()

    // Execute one frame, updating IOBus.currentTstate so Beeper
    // knows exactly when each port write happened within the frame
    let tStates = 0
    while (tStates < TSTATES_PER_FRAME) {
      this.io.currentTstate = tStates
      tStates += this.cpu.step()
    }

    this.beeper.endFrame(tStates)

    this.ula.renderFrame()
    this.renderer.drawFrame()

    this.rafId = requestAnimationFrame(this.tick)
  }
}
