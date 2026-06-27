/**
 * Spectrum
 *
 * Top-level facade that wires together CPU, Memory, ULA and FrameLoop.
 * This is the single entry point the UI layer talks to.
 *
 * Usage:
 *   const canvas = document.getElementById('screen') as HTMLCanvasElement
 *   const spectrum = new Spectrum(canvas)
 *   await spectrum.loadROM(romBytes)
 *   spectrum.start()
 */
import { CPU }       from './cpu/CPU.js'
import { Memory }    from './memory/Memory.js'
import { ULA }       from './ula/ULA.js'
import { Renderer }  from './ula/Renderer.js'
import { FrameLoop } from './ula/FrameLoop.js'

export class Spectrum {
  readonly mem      : Memory
  readonly cpu      : CPU
  readonly ula      : ULA
  readonly renderer : Renderer
  readonly loop     : FrameLoop

  constructor(canvas: HTMLCanvasElement) {
    this.mem      = new Memory()
    this.cpu      = new CPU(this.mem)
    this.ula      = new ULA(this.mem)
    this.renderer = new Renderer(canvas, this.ula)
    this.loop     = new FrameLoop(this.cpu, this.ula, this.renderer)
  }

  /** Load a ROM image (up to 16 KB) */
  loadROM(rom: Uint8Array): void {
    this.mem.loadROM(rom)
    this.cpu.regs.PC = 0x0000
  }

  start(): void  { this.loop.start() }
  stop(): void   { this.loop.stop() }
  reset(): void  {
    this.stop()
    this.cpu.regs.PC = 0x0000
    this.cpu.halted  = false
    this.cpu.tStates = 0
    this.start()
  }

  isRunning(): boolean { return this.loop.isRunning() }
}
