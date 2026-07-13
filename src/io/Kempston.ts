/**
 * Kempston Joystick
 *
 * Read via port 0x1F (any address with bits 0-4 matching 0x1F,
 * but in practice just port 0x1F).
 *
 * Return byte:
 *   bit 0 = right
 *   bit 1 = left
 *   bit 2 = down
 *   bit 3 = up
 *   bit 4 = fire
 *   bits 5-7 = 0
 *
 * PC key mapping (cursor keys + Alt for fire):
 *   ArrowRight → bit 0
 *   ArrowLeft  → bit 1
 *   ArrowDown  → bit 2
 *   ArrowUp    → bit 3
 *   AltLeft / AltRight / Space → bit 4 (fire)
 */

export const KEMPSTON_PORT = 0x1f

export const enum KempstonBit {
  RIGHT = 0x01,
  LEFT  = 0x02,
  DOWN  = 0x04,
  UP    = 0x08,
  FIRE  = 0x10,
}

const KEY_MAP: Record<string, KempstonBit> = {
  'ArrowRight': KempstonBit.RIGHT,
  'ArrowLeft':  KempstonBit.LEFT,
  'ArrowDown':  KempstonBit.DOWN,
  'ArrowUp':    KempstonBit.UP,
  'AltLeft':    KempstonBit.FIRE,
  'AltRight':   KempstonBit.FIRE,
}

export class Kempston {
  private state = 0x00   // all released

  keyDown(code: string): void {
    const bit = KEY_MAP[code]
    if (bit !== undefined) this.state |= bit
  }

  keyUp(code: string): void {
    const bit = KEY_MAP[code]
    if (bit !== undefined) this.state &= ~bit & 0xff
  }

  reset(): void { this.state = 0x00 }

  /** Returns the byte the CPU reads from port 0x1F */
  read(): number { return this.state & 0x1f }
}
