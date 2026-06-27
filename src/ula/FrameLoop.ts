import { CPU } from '../cpu/CPU.js'
import { ULA, TSTATES_PER_FRAME } from './ULA.js'
import { Renderer } from './Renderer.js'

/**
 * FrameLoop
 *
 * Runs the emulator at ~50 Hz using requestAnimationFrame.
 * Each frame:
 *   1. Execute Z80 instructions until TSTATES_PER_FRAME T-states consumed
 *   2. Render ULA frame
 *   3. Blit to canvas
 *   4. Schedule next frame
 *
 * Usage:
 *   const loop = new FrameLoop(cpu, ula, renderer)
 *   loop.start()
 *   // later:
 *   loop.stop()
 */
export class FrameLoop {
  private running  = false
  private rafId    = 0

  constructor(
    private readonly cpu: CPU,
    private readonly ula: ULA,
    private readonly renderer: Renderer,
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.tick()
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  isRunning(): boolean { return this.running }

  private tick = (): void => {
    if (!this.running) return

    // Run Z80 for one frame worth of T-states
    let tStates = 0
    while (tStates < TSTATES_PER_FRAME) {
      tStates += this.cpu.step()
    }

    // Render
    this.ula.renderFrame()
    this.renderer.drawFrame()

    this.rafId = requestAnimationFrame(this.tick)
  }
}
