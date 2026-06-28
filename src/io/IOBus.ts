/**
 * IOBus
 *
 * The ZX Spectrum 48K I/O address decoding is partial — the ULA only
 * checks bit 0 of the port address (must be 0 = even port).
 *
 * Port 0xFE (any even address with A0=0):
 *   WRITE → bits 2-0 = border colour, bit 3 = MIC, bit 4 = EAR/beeper
 *   READ  → bits 4-0 = keyboard row (0=pressed), bit 6 = EAR input
 *
 * All odd ports (A0=1) are not decoded by the ULA and return 0xFF.
 *
 * The high byte of the port selects the keyboard row for reads:
 *   IN A,(0xFE) — full port = (A << 8) | 0xFE
 *   The ULA responds to ANY even port (A0=0), using the high byte
 *   to select keyboard rows.
 */
import { Keyboard } from './Keyboard.js'
import { ULA }      from '../ula/ULA.js'

export class IOBus {
  constructor(
    private readonly keyboard: Keyboard,
    private readonly ula: ULA,
  ) {}

  /**
   * Called by CPU on IN A,(n).
   * port = full 16-bit port address = (A << 8) | n
   */
  read(port: number): number {
    // ULA responds to even ports (A0 = 0)
    if ((port & 0x01) === 0) {
      const portHigh = (port >> 8) & 0xff
      return this.keyboard.read(portHigh)
    }
    // Unconnected port — floating bus returns 0xFF
    return 0xff
  }

  /**
   * Called by CPU on OUT (n),A.
   * port = full 16-bit port address = (A << 8) | n
   */
  write(port: number, value: number): void {
    // ULA responds to even ports (A0 = 0)
    if ((port & 0x01) === 0) {
      this.ula.writePort(value)
    }
    // Other ports (AY sound chip etc.) ignored for now
  }
}
