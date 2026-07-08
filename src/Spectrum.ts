import { CPU }           from './cpu/CPU.js'
import { Memory }        from './memory/Memory.js'
import { ULA }           from './ula/ULA.js'
import { Renderer }      from './ula/Renderer.js'
import { FrameLoop }     from './ula/FrameLoop.js'
import { Keyboard }      from './io/Keyboard.js'
import { IOBus }         from './io/IOBus.js'
import { Beeper }        from './audio/Beeper.js'
import { TapePlayer }    from './tape/TapePlayer.js'
import { loadSnapshot }  from './snapshot/SnapshotLoader.js'
import { loadTape }      from './tape/TapeLoader.js'

export class Spectrum {
  readonly mem      : Memory
  readonly keyboard : Keyboard
  readonly ula      : ULA
  readonly beeper   : Beeper
  readonly tape     : TapePlayer
  readonly io       : IOBus
  readonly cpu      : CPU
  readonly renderer : Renderer
  readonly loop     : FrameLoop

  constructor(canvas: HTMLCanvasElement) {
    this.mem      = new Memory()
    this.keyboard = new Keyboard()
    this.ula      = new ULA(this.mem)
    this.beeper   = new Beeper()
    this.tape     = new TapePlayer()
    this.io       = new IOBus(this.keyboard, this.ula, this.beeper, this.tape)
    this.cpu      = new CPU(this.mem, this.io)
    this.renderer = new Renderer(canvas, this.ula)
    this.loop     = new FrameLoop(this.cpu, this.ula, this.renderer, this.beeper, this.io, this.tape)
  }

  loadROM(rom: Uint8Array): void {
    this.mem.loadROM(rom)
    this.cpu.regs.PC = 0x0000
    this.loop.fastBoot()
  }

  loadSnapshot(data: Uint8Array, filename: string): void {
    const wasRunning = this.loop.isRunning()
    this.loop.stop()
    loadSnapshot(data, filename, {
      regs: this.cpu.regs,
      halted: this.cpu.halted,
      mem: this.mem,
      ula: this.ula,
    })
    this.cpu.halted = false
    if (wasRunning) this.loop.start()
  }

  loadTape(data: Uint8Array, filename: string): void {
    const blocks = loadTape(data, filename)
    this.tape.load(blocks)
  }

  start(): void  { this.loop.start() }
  stop(): void   { this.loop.stop() }

  reset(): void {
    this.loop.stop()
    this.tape.stop()
    this.cpu.regs.PC = 0x0000
    this.cpu.halted  = false
    this.cpu.tStates = 0
    this.keyboard.reset()
    this.loop.start()
  }

  isRunning(): boolean { return this.loop.isRunning() }

  /** Speed multiplier: 1.0 = normal ZX Spectrum speed (50 Hz) */
  get speed(): number { return this.loop.speedFactor }
  set speed(v: number) { this.loop.speedFactor = Math.max(0.25, Math.min(8, v)) }
}
