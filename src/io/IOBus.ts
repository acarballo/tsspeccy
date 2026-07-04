/**
 * IOBus
 *
 * ZX Spectrum 48K I/O decoding.
 * The ULA responds to any even port (A0=0).
 *
 * Port 0xFE write:
 *   bits 2-0 = border colour
 *   bit  3   = MIC output (tape, ignored)
 *   bit  4   = EAR/beeper speaker
 *
 * Port 0xFE read:
 *   bits 4-0 = keyboard rows (0=pressed), bit 6 = EAR input
 */
import { Keyboard } from './Keyboard.js'
import { ULA }      from '../ula/ULA.js'
import { Beeper }   from '../audio/Beeper.js'

export class IOBus {
  /** Current CPU T-state within the frame — set by FrameLoop each step */
  currentTstate = 0

  constructor(
    private readonly keyboard: Keyboard,
    private readonly ula:      ULA,
    private readonly beeper?:  Beeper,
  ) {}

  read(port: number): number {
    if ((port & 0x01) === 0) {
      const portHigh = (port >> 8) & 0xff
      return this.keyboard.read(portHigh)
    }
    return 0xff
  }

  write(port: number, value: number): void {
    if ((port & 0x01) === 0) {
      this.ula.writePort(value)
      this.beeper?.writePort(value, this.currentTstate)
    }
  }
}
