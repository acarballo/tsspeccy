/**
 * Z80Snapshot
 *
 * Loads .z80 snapshot files (versions 1, 2 and 3) into a running Spectrum.
 *
 * Format reference:
 *   https://worldofspectrum.org/faq/reference/z80format.htm
 *
 * Layout:
 *   v1: 30-byte header + compressed/uncompressed 48K RAM image
 *   v2: 30-byte header + 2-byte ext-len (23) + ext header + compressed pages
 *   v3: 30-byte header + 2-byte ext-len (54/55) + ext header + compressed pages
 *
 * Page mapping for 48K:
 *   page 4 → 0x8000–0xBFFF
 *   page 5 → 0xC000–0xFFFF
 *   page 8 → 0x4000–0x7FFF  (screen RAM)
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

// ─────────────────────────────────────────────────────────────────────────────
// Decompression
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decompress Z80 v1 RAM block (entire 48K, terminated by 0x00 ED ED 00).
 * Returns a flat 49152-byte array (0x4000–0xFFFF).
 */
function decompressV1(src: Uint8Array, offset: number, compressed: boolean): Uint8Array {
  if (!compressed) {
    return src.slice(offset, offset + 49152)
  }

  const out = new Uint8Array(49152)
  let si = offset
  let di = 0

  while (di < 49152 && si < src.length - 3) {
    // End marker: 00 ED ED 00
    if (src[si] === 0x00 && src[si+1] === 0xed && src[si+2] === 0xed && src[si+3] === 0x00) break

    if (src[si] === 0xed && src[si+1] === 0xed) {
      const count = src[si+2]!
      const val   = src[si+3]!
      for (let i = 0; i < count && di < 49152; i++) out[di++] = val
      si += 4
    } else {
      out[di++] = src[si++]!
    }
  }

  return out
}

/**
 * Decompress a single Z80 v2/v3 page block.
 * length=0xFFFF means uncompressed (16384 bytes).
 */
function decompressPage(src: Uint8Array, offset: number, length: number): Uint8Array {
  if (length === 0xffff) {
    return src.slice(offset, offset + 16384)
  }

  const out = new Uint8Array(16384)
  let si = offset
  let di = 0
  const end = offset + length

  while (si < end && di < 16384) {
    if (src[si] === 0xed && si + 1 < end && src[si+1] === 0xed) {
      si += 2
      const count = src[si++]!
      const val   = src[si++]!
      for (let i = 0; i < count && di < 16384; i++) out[di++] = val
    } else {
      out[di++] = src[si++]!
    }
  }

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loader
// ─────────────────────────────────────────────────────────────────────────────

export function loadZ80(data: Uint8Array, target: SnapshotTarget): void {
  const { regs, mem, ula } = target
  const v = new DataView(data.buffer, data.byteOffset)

  // ── Common 30-byte header ─────────────────────────────────────────────────
  regs.A  = data[0]!
  regs.F  = data[1]!
  regs.C  = data[2]!;  regs.B  = data[3]!
  regs.L  = data[4]!;  regs.H  = data[5]!
  const pcV1 = v.getUint16(6,  true)   // PC (v1 only — 0 means v2/v3)
  regs.SP    = v.getUint16(8,  true)
  regs.I     = data[10]!
  regs.R     = data[11]! & 0x7f

  const misc    = data[12]!
  // bit 7 of misc: if set, R bit 7 = 1
  regs.R = (regs.R & 0x7f) | ((misc & 0x01) !== 0 ? 0x80 : 0)
  const border  = (misc >> 1) & 0x07
  const compressed = (misc & 0x20) !== 0   // only meaningful for v1

  regs.E  = data[13]!;  regs.D  = data[14]!
  regs.C_ = data[15]!;  regs.B_ = data[16]!
  regs.E_ = data[17]!;  regs.D_ = data[18]!
  regs.L_ = data[19]!;  regs.H_ = data[20]!
  regs.A_ = data[21]!;  regs.F_ = data[22]!
  regs.IY = v.getUint16(23, true)
  regs.IX = v.getUint16(25, true)

  regs.IFF1 = data[27] !== 0
  regs.IFF2 = data[28] !== 0
  regs.IM   = data[29]! & 0x03

  ula.setBorderColour(border)
  target.halted = false

  // ── Determine version ─────────────────────────────────────────────────────
  if (pcV1 !== 0) {
    // ── VERSION 1 ────────────────────────────────────────────────────────────
    regs.PC = pcV1
    const ram = decompressV1(data, 30, compressed)
    mem.load(0x4000, ram)
    return
  }

  // v2 or v3: additional header follows immediately after byte 30
  const extLen = v.getUint16(30, true)  // 23 = v2, 54 or 55 = v3
  const pcV2   = v.getUint16(32, true)
  regs.PC = pcV2

  const hardware = data[34]!
  // For 48K: hardware=0 (v2) or 0/1 (v3).  We only support 48K here.
  if (extLen >= 54) {
    // v3 extras (port 0x7FFD, AY registers, etc.) — ignore for 48K
  }

  // Data blocks start after the extended header
  let offset = 32 + extLen

  while (offset < data.length) {
    if (offset + 3 > data.length) break

    const blockLen  = v.getUint16(offset, true)
    const pageNum   = data[offset + 2]!
    offset += 3

    const pageData = decompressPage(data, offset, blockLen)
    offset += blockLen === 0xffff ? 16384 : blockLen

    // 48K page mapping
    switch (pageNum) {
      case 4: mem.load(0x8000, pageData); break   // RAM page 2
      case 5: mem.load(0xc000, pageData); break   // RAM page 0
      case 8: mem.load(0x4000, pageData); break   // Screen RAM (page 5)
    }
  }
}
