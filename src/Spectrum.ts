/**
 * Spectrum
 *
 * Top-level facade that wires together CPU, Memory, ULA, IOBus,
 * Keyboard and FrameLoop.
 */
import { CPU }       from './cpu/CPU.js'
import { Memory }    from './memory/Memory.js'
import { ULA }       from './ula/ULA.js'
import { Renderer }  from './ula/Renderer.js'
import { FrameLoop } from './ula/FrameLoop.js'
import { Keyboard }  from './io/Keyboard.js'
import { IOBus }     from './io/IOBus.js'

export class Spectrum {
  readonly mem      : Memory
  readonly keyboard : Keyboard
  readonly ula      : ULA
  readonly io       : IOBus
  readonly cpu      : CPU
  readonly renderer : Renderer
  readonly loop     : FrameLoop

  constructor(canvas: HTMLCanvasElement) {
    this.mem      = new Memory()
    this.keyboard = new Keyboard()
    this.ula      = new ULA(this.mem)
    this.io       = new IOBus(this.keyboard, this.ula)
    this.cpu      = new CPU(this.mem, this.io)
    this.renderer = new Renderer(canvas, this.ula)
    this.loop     = new FrameLoop(this.cpu, this.ula, this.renderer)
  }

  loadROM(rom: Uint8Array): void {
    this.mem.loadROM(rom)
    this.cpu.regs.PC = 0x0000
    // Skip the ROM's RAM test (~22 frames of black screen) so the
    // browser goes straight to the BASIC editor on first Start.
    this.loop.fastBoot()
  }

  start(): void  { this.loop.start() }
  stop(): void   { this.loop.stop() }

  reset(): void {
    this.stop()
    this.cpu.regs.PC = 0x0000
    this.cpu.halted  = false
    this.cpu.tStates = 0
    this.keyboard.reset()
    this.start()
  }

  isRunning(): boolean { return this.loop.isRunning() }
}
