/**
 * Keyboard
 *
 * The ZX Spectrum 48K uses a 5×8 matrix (40 keys total).
 * Read via port 0xFE — the HIGH byte of the port address selects the row.
 *
 * Port high byte → row:
 *   0xFE (bit 0 low) → row 0: Shift  Z  X  C  V
 *   0xFD (bit 1 low) → row 1: A      S  D  F  G
 *   0xFB (bit 2 low) → row 2: Q      W  E  R  T
 *   0xF7 (bit 3 low) → row 3: 1      2  3  4  5
 *   0xEF (bit 4 low) → row 4: 0      9  8  7  6
 *   0xDF (bit 5 low) → row 5: P      O  I  U  Y
 *   0xBF (bit 6 low) → row 6: Enter  L  K  J  H
 *   0x7F (bit 7 low) → row 7: Space  SS M  N  B
 *
 * Bit is 0 when key IS pressed, 1 when released.
 * Bits 7-5 of result: 111 (bit 6 = EAR, always 1 = no tape signal).
 */

interface MatrixKey { row: number; bit: number }

const KEY_MAP: Readonly<Record<string, MatrixKey>> = {
  // Row 0 — Caps Shift, Z, X, C, V
  'ShiftLeft':   { row: 0, bit: 0 },
  'ShiftRight':  { row: 0, bit: 0 },
  'KeyZ':        { row: 0, bit: 1 },
  'KeyX':        { row: 0, bit: 2 },
  'KeyC':        { row: 0, bit: 3 },
  'KeyV':        { row: 0, bit: 4 },
  // Row 1 — A, S, D, F, G
  'KeyA':        { row: 1, bit: 0 },
  'KeyS':        { row: 1, bit: 1 },
  'KeyD':        { row: 1, bit: 2 },
  'KeyF':        { row: 1, bit: 3 },
  'KeyG':        { row: 1, bit: 4 },
  // Row 2 — Q, W, E, R, T
  'KeyQ':        { row: 2, bit: 0 },
  'KeyW':        { row: 2, bit: 1 },
  'KeyE':        { row: 2, bit: 2 },
  'KeyR':        { row: 2, bit: 3 },
  'KeyT':        { row: 2, bit: 4 },
  // Row 3 — 1, 2, 3, 4, 5
  'Digit1':      { row: 3, bit: 0 },
  'Digit2':      { row: 3, bit: 1 },
  'Digit3':      { row: 3, bit: 2 },
  'Digit4':      { row: 3, bit: 3 },
  'Digit5':      { row: 3, bit: 4 },
  // Row 4 — 0, 9, 8, 7, 6
  'Digit0':      { row: 4, bit: 0 },
  'Digit9':      { row: 4, bit: 1 },
  'Digit8':      { row: 4, bit: 2 },
  'Digit7':      { row: 4, bit: 3 },
  'Digit6':      { row: 4, bit: 4 },
  // Row 5 — P, O, I, U, Y
  'KeyP':        { row: 5, bit: 0 },
  'KeyO':        { row: 5, bit: 1 },
  'KeyI':        { row: 5, bit: 2 },
  'KeyU':        { row: 5, bit: 3 },
  'KeyY':        { row: 5, bit: 4 },
  // Row 6 — Enter, L, K, J, H
  'Enter':       { row: 6, bit: 0 },
  'KeyL':        { row: 6, bit: 1 },
  'KeyK':        { row: 6, bit: 2 },
  'KeyJ':        { row: 6, bit: 3 },
  'KeyH':        { row: 6, bit: 4 },
  // Row 7 — Space, Symbol Shift, M, N, B
  'Space':       { row: 7, bit: 0 },
  'AltLeft':     { row: 7, bit: 1 },
  'AltRight':    { row: 7, bit: 1 },
  'KeyM':        { row: 7, bit: 2 },
  'KeyN':        { row: 7, bit: 3 },
  'KeyB':        { row: 7, bit: 4 },
}

export class Keyboard {
  /** Pressed state per row, bit N = 1 means key is DOWN (inverted on read) */
  private readonly matrix = new Uint8Array(8)

  keyDown(code: string): void {
    const key = KEY_MAP[code]
    if (key) this.matrix[key.row]! |= (1 << key.bit)
  }

  keyUp(code: string): void {
    const key = KEY_MAP[code]
    if (key) this.matrix[key.row]! &= ~(1 << key.bit) & 0xff
  }

  reset(): void { this.matrix.fill(0) }

  /**
   * Read keyboard state for a given port high byte.
   * portHigh is the A register value when IN A,(0xFE) is executed.
   * A row is selected when its corresponding bit in portHigh is LOW.
   */
  read(portHigh: number): number {
    let result = 0x1f  // 5 bits, all released

    for (let row = 0; row < 8; row++) {
      if ((portHigh & (1 << row)) === 0) {
        result &= ~this.matrix[row]! & 0x1f
      }
    }

    return 0xe0 | result  // bits 7-5 = 111 (EAR=1, no tape)
  }

  getRow(row: number): number { return this.matrix[row] ?? 0 }
}