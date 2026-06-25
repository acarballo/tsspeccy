/**
 * Z80 register file.
 *
 * All values are stored as numbers and masked on access:
 *   - 8-bit registers:  & 0xFF
 *   - 16-bit registers: & 0xFFFF
 *
 * The Z80 has two register banks (main + alternate).
 * EX AF,AF' and EXX swap between them.
 */
export class Registers {
  // ── Main register bank ──────────────────────────────────────────
  A = 0xff;  F = 0xff
  B = 0xff;  C = 0xff
  D = 0xff;  E = 0xff
  H = 0xff;  L = 0xff

  // ── Alternate register bank ──────────────────────────────────────
  A_ = 0xff; F_ = 0xff
  B_ = 0xff; C_ = 0xff
  D_ = 0xff; E_ = 0xff
  H_ = 0xff; L_ = 0xff

  // ── Index registers ───────────────────────────────────────────────
  IX = 0xffff
  IY = 0xffff

  // ── Special registers ─────────────────────────────────────────────
  SP = 0xffff
  PC = 0x0000
  I  = 0xff    // Interrupt vector
  R  = 0xff    // Memory refresh

  // ── Interrupt flip-flops ──────────────────────────────────────────
  IFF1 = false
  IFF2 = false
  IM   = 0      // Interrupt mode (0, 1 or 2)

  // ─────────────────────────────────────────────────────────────────
  // 16-bit pair accessors (little-endian: low byte first)
  // ─────────────────────────────────────────────────────────────────

  get AF(): number { return ((this.A & 0xff) << 8) | (this.F & 0xff) }
  set AF(v: number) { this.A = (v >> 8) & 0xff; this.F = v & 0xff }

  get BC(): number { return ((this.B & 0xff) << 8) | (this.C & 0xff) }
  set BC(v: number) { this.B = (v >> 8) & 0xff; this.C = v & 0xff }

  get DE(): number { return ((this.D & 0xff) << 8) | (this.E & 0xff) }
  set DE(v: number) { this.D = (v >> 8) & 0xff; this.E = v & 0xff }

  get HL(): number { return ((this.H & 0xff) << 8) | (this.L & 0xff) }
  set HL(v: number) { this.H = (v >> 8) & 0xff; this.L = v & 0xff }

  // ─────────────────────────────────────────────────────────────────
  // EX instructions
  // ─────────────────────────────────────────────────────────────────

  /** EX AF, AF' */
  exAF(): void {
    [this.A, this.A_] = [this.A_, this.A];
    [this.F, this.F_] = [this.F_, this.F]
  }

  /** EXX  (BC/DE/HL ↔ BC'/DE'/HL') */
  exx(): void {
    [this.B, this.B_] = [this.B_, this.B];
    [this.C, this.C_] = [this.C_, this.C];
    [this.D, this.D_] = [this.D_, this.D];
    [this.E, this.E_] = [this.E_, this.E];
    [this.H, this.H_] = [this.H_, this.H];
    [this.L, this.L_] = [this.L_, this.L]
  }
}
