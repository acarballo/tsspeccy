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

  /**
   * Fast-boot: execute up to maxFrames of CPU time without rendering,
   * stopping early once the ROM has finished init (IFF1 enabled = EI executed).
   * This skips the ~1.5s black screen during RAM test.
   */
  fastBoot(maxFrames = 150): void {
    for (let f = 0; f < maxFrames; f++) {
      this.cpu.interrupt()
      let t = 0
      while (t < TSTATES_PER_FRAME) t += this.cpu.step()
      // ROM enables interrupts (EI / IM 1) just before entering the BASIC editor
      if (this.cpu.regs.IFF1 && this.cpu.regs.IM === 1) break
    }
    // Render the first real frame immediately
    this.ula.renderFrame()
    this.renderer.drawFrame()
  }

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

    // Trigger the 50Hz maskable interrupt at the start of the frame
    // (this is what the ULA does in real hardware — it pulses /INT
    // for ~32 T-states at the start of each frame)
    this.cpu.interrupt()

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
