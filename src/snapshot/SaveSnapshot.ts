/**
 * SaveSnapshot
 *
 * Serialises the current emulator state into a .z80 v1 file
 * (uncompressed, 30-byte header + 49152 bytes of RAM).
 *
 * Z80 v1 header layout (30 bytes):
 *   0   A
 *   1   F
 *   2   C
 *   3   B
 *   4   L
 *   5   H
 *   6   PC lo  (0x00 in v2/v3 — we use v1 so this holds the real PC)
 *   7   PC hi
 *   8   SP lo
 *   9   SP hi
 *   10  I
 *   11  R  (bit 7 preserved)
 *   12  misc: bit0=R bit7, bits 1-3=border, bit5=compressed(0=no)
 *   13  E
 *   14  D
 *   15  C'
 *   16  B'
 *   17  E'
 *   18  D'
 *   19  L'
 *   20  H'
 *   21  A'
 *   22  F'
 *   23  IY lo
 *   24  IY hi
 *   25  IX lo
 *   26  IX hi
 *   27  IFF1  (0=disabled, 1=enabled)
 *   28  IFF2
 *   29  IM (bits 1-0)
 *
 * RAM: bytes 30–49181 = 0x4000–0xFFFF (49152 bytes, uncompressed)
 */

import type { Registers } from '../cpu/Registers.js'
import type { Memory }    from '../memory/Memory.js'
import type { ULA }       from '../ula/ULA.js'

export interface SnapshotSource {
  regs:   Registers
  halted: boolean
  mem:    Memory
  ula:    ULA
}

const HEADER_SIZE = 30
const RAM_SIZE    = 49152  // 0x4000–0xFFFF
const TOTAL_SIZE  = HEADER_SIZE + RAM_SIZE

/**
 * Serialise current state to a .z80 v1 snapshot.
 * Returns a Uint8Array ready to be saved/downloaded.
 */
export function saveZ80(src: SnapshotSource): Uint8Array {
  const out  = new Uint8Array(TOTAL_SIZE)
  const regs = src.regs

  // ── Header ──────────────────────────────────────────────────────
  out[0]  = regs.A
  out[1]  = regs.F
  out[2]  = regs.C
  out[3]  = regs.B
  out[4]  = regs.L
  out[5]  = regs.H
  // Note: in z80 v1 format, PC=0x0000 signals a v2/v3 file.
  // In practice the Spectrum's PC is never 0 when a game is running,
  // but we guard against it just in case.
  const pc = regs.PC === 0 ? 0x0001 : regs.PC
  out[6]  = pc & 0xff         // PC lo
  out[7]  = (pc >> 8) & 0xff  // PC hi
  out[8]  = regs.SP & 0xff
  out[9]  = (regs.SP >> 8) & 0xff
  out[10] = regs.I
  out[11] = regs.R & 0x7f          // bits 0-6 of R
  // misc byte: bit0=R bit7, bits3-1=border colour, bit5=0 (uncompressed)
  out[12] = ((regs.R & 0x80) ? 1 : 0) | ((src.ula.getBorderColour() & 0x07) << 1)
  out[13] = regs.E
  out[14] = regs.D
  out[15] = regs.C_
  out[16] = regs.B_
  out[17] = regs.E_
  out[18] = regs.D_
  out[19] = regs.L_
  out[20] = regs.H_
  out[21] = regs.A_
  out[22] = regs.F_
  out[23] = regs.IY & 0xff
  out[24] = (regs.IY >> 8) & 0xff
  out[25] = regs.IX & 0xff
  out[26] = (regs.IX >> 8) & 0xff
  out[27] = regs.IFF1 ? 1 : 0
  out[28] = regs.IFF2 ? 1 : 0
  out[29] = regs.IM & 0x03

  // ── RAM 0x4000–0xFFFF ───────────────────────────────────────────
  for (let addr = 0x4000; addr <= 0xffff; addr++) {
    out[HEADER_SIZE + (addr - 0x4000)] = src.mem.read(addr)
  }

  return out
}

/**
 * Trigger a browser download of the snapshot data.
 * filename should end in .z80
 */
export function downloadSnapshot(data: Uint8Array, filename: string): void {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
