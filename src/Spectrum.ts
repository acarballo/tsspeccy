/**
 * Spectrum
 *
 * Top-level facade that wires together CPU, Memory, ULA, IOBus,
 * Keyboard and FrameLoop.
 */
import { CPU }            from './cpu/CPU.js'
import { Memory }         from './memory/Memory.js'
import { ULA }            from './ula/ULA.js'
import { Renderer }       from './ula/Renderer.js'
import { FrameLoop }      from './ula/FrameLoop.js'
import { Keyboard }       from './io/Keyboard.js'
import { IOBus }          from './io/IOBus.js'
import { loadSnapshot }   from './snapshot/SnapshotLoader.js'

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
    this.loop.fastBoot()
  }

  /**
   * Load a .z80 or .sna snapshot.
   * The emulator must have a ROM loaded first (loadROM must have been called).
   * Stops the current frame loop, restores state, then resumes.
   */
  loadSnapshot(data: Uint8Array, filename: string): void {
    const wasRunning = this.loop.isRunning()
    this.loop.stop()
    this.keyboard.reset()

    loadSnapshot(data, filename, {
      regs:   this.cpu.regs,
      halted: this.cpu.halted,
      mem:    this.mem,
      ula:    this.ula,
    })

    // Sync halted flag (snapshot loaders always clear it)
    this.cpu.halted   = false
    this.cpu.tStates  = 0

    // Render first frame immediately so the screen appears before Start
    this.ula.renderFrame()
    this.renderer.drawFrame()

    if (wasRunning) this.loop.start()
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
