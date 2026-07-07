/**
 * IOBus — ZX Spectrum 48K I/O decoding.
 *
 * Port 0xFE write: bits 2-0 = border, bit 3 = MIC, bit 4 = EAR/beeper
 * Port 0xFE read:  bits 4-0 = keyboard, bit 6 = EAR input (tape)
 *
 * The ULA responds to any even port (A0=0).
 */
import { Keyboard }    from './Keyboard.js'
import { ULA }         from '../ula/ULA.js'
import { Beeper }      from '../audio/Beeper.js'
import { TapePlayer }  from '../tape/TapePlayer.js'

export class IOBus {
  currentTstate = 0

  constructor(
    private readonly keyboard:    Keyboard,
    private readonly ula:         ULA,
    private readonly beeper?:     Beeper,
    private readonly tape?:       TapePlayer,
  ) {}

  read(port: number): number {
    if ((port & 0x01) === 0) {
      const portHigh = (port >> 8) & 0xff
      // Keyboard: bits 4-0 (0 = pressed)
      const keys = this.keyboard.read(portHigh)
      // EAR input: bit 6 from tape player (or 1 if no tape)
      const ear  = this.tape?.isPlaying() ? this.tape.earBit() : 0x40
      // Combine: keep keyboard bits, replace bit 6 with EAR
      return (keys & ~0x40) | ear
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
