/**
 * SNASnapshot
 *
 * Loads .sna snapshot files into a running Spectrum.
 *
 * Format: 27-byte header + 49152 bytes of RAM (0x4000–0xFFFF), total 49179 bytes.
 * The PC is stored ON the stack (not in the header) — the snapshot was taken
 * while the CPU was in an interrupt, so PC was pushed to SP before the header
 * was written. We restore it by popping from the stack.
 *
 * Reference: https://worldofspectrum.org/faq/reference/formats.htm#SNA
 */

import type { Registers } from '../cpu/Registers.js'
import type { Memory }    from '../memory/Memory.js'
import type { ULA }       from '../ula/ULA.js'

export interface SnapshotTarget {
  regs: Registers
  halted: boolean
  mem: Memory
  ula: ULA
}

export function loadSNA(data: Uint8Array, target: SnapshotTarget): void {
  if (data.length < 49179) {
    throw new Error(`SNA file too short: ${data.length} bytes (expected 49179)`)
  }

  const { regs, mem, ula } = target
  const v = new DataView(data.buffer, data.byteOffset)

  // ── 27-byte header ───────────────────────────────────────────────────────
  regs.I   = data[0]!

  regs.L_  = data[1]!;  regs.H_  = data[2]!
  regs.E_  = data[3]!;  regs.D_  = data[4]!
  regs.C_  = data[5]!;  regs.B_  = data[6]!
  regs.F_  = data[7]!;  regs.A_  = data[8]!

  regs.L   = data[9]!;  regs.H   = data[10]!
  regs.E   = data[11]!; regs.D   = data[12]!
  regs.C   = data[13]!; regs.B   = data[14]!

  regs.IY  = v.getUint16(15, true)
  regs.IX  = v.getUint16(17, true)

  regs.IFF1 = (data[19]! & 0x04) !== 0
  regs.IFF2 = regs.IFF1
  regs.R    = data[20]!

  regs.F   = data[21]!; regs.A   = data[22]!
  regs.SP  = v.getUint16(23, true)
  regs.IM  = data[25]! & 0x03

  const border = data[26]! & 0x07
  ula.setBorderColour(border)
  target.halted = false

  // ── 49152 bytes of RAM (0x4000–0xFFFF) ───────────────────────────────────
  mem.load(0x4000, data.slice(27, 27 + 49152))

  // ── Restore PC from stack ─────────────────────────────────────────────────
  // The SNA format stores PC on top of the stack.
  // We pop it just as the real CPU would after RETN.
  regs.PC = mem.read16(regs.SP)
  regs.SP = (regs.SP + 2) & 0xffff
}
