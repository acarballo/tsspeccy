import { CPU }                    from '../cpu/CPU.js'
import { ULA, TSTATES_PER_FRAME } from './ULA.js'
import { Renderer }               from './Renderer.js'
import { Beeper }                 from '../audio/Beeper.js'
import { IOBus }                  from '../io/IOBus.js'
import { TapePlayer }             from '../tape/TapePlayer.js'

export class FrameLoop {
  private running = false
  private rafId   = 0

  constructor(
    private readonly cpu:      CPU,
    private readonly ula:      ULA,
    private readonly renderer: Renderer,
    private readonly beeper:   Beeper,
    private readonly io:       IOBus,
    private readonly tape:     TapePlayer,
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
    this.beeper.resume()

    let tStates = 0
    while (tStates < TSTATES_PER_FRAME) {
      this.io.currentTstate = tStates
      const stepped = this.cpu.step()
      // Advance tape in sync with CPU T-states
      this.tape.advanceTstates(stepped)
      tStates += stepped
    }

    this.beeper.endFrame(tStates)
    this.ula.renderFrame()
    this.renderer.drawFrame()

    this.rafId = requestAnimationFrame(this.tick)
  }
}
