/**
 * TZXParser
 *
 * Parses .tzx files into TapeBlocks.
 *
 * TZX format: 10-byte header + sequence of typed blocks.
 * Reference: https://worldofspectrum.org/faq/reference/tzxformat.htm
 *
 * We implement the most common block types:
 *   0x10 — Standard Speed Data  (covers 99% of games)
 *   0x11 — Turbo Speed Data
 *   0x12 — Pure Tone
 *   0x13 — Pulse Sequence
 *   0x14 — Pure Data
 *   0x20 — Pause / Stop the Tape
 *   0x30 — Text Description     (metadata, skip)
 *   0x32 — Archive Info         (metadata, skip)
 *   0x35 — Custom Info          (metadata, skip)
 *   0x5A — Glue Block           (compatibility, skip)
 */
import {
  type TapeBlock, dataToPulses, describeBlock,
  PILOT_PULSE, SYNC1_PULSE, SYNC2_PULSE, BIT0_PULSE, BIT1_PULSE,
  PILOT_HEADER, PILOT_DATA,
} from './TapeBlock.js'

const TZX_MAGIC = 'ZXTape!'

export function parseTZX(data: Uint8Array): TapeBlock[] {
  // Validate header
  const magic = String.fromCharCode(...data.slice(0, 7))
  if (magic !== TZX_MAGIC) throw new Error('Not a valid TZX file')
  // data[7] = 0x1A, data[8] = major version, data[9] = minor version

  const blocks: TapeBlock[] = []
  let offset = 10  // skip 10-byte header

  while (offset < data.length) {
    const blockId = data[offset++]

    switch (blockId) {

      // ── 0x10: Standard Speed Data Block ───────────────────────────
      case 0x10: {
        const pauseMs  = data[offset]! | (data[offset+1]! << 8); offset += 2
        const length   = data[offset]! | (data[offset+1]! << 8); offset += 2
        const blockData = data.slice(offset, offset + length); offset += length
        blocks.push({
          description: describeBlock(blockData),
          pulses: dataToPulses(blockData, pauseMs),
        })
        break
      }

      // ── 0x11: Turbo Speed Data Block ──────────────────────────────
      case 0x11: {
        const pilotPulse = data[offset]! | (data[offset+1]! << 8); offset += 2
        const sync1      = data[offset]! | (data[offset+1]! << 8); offset += 2
        const sync2      = data[offset]! | (data[offset+1]! << 8); offset += 2
        const bit0       = data[offset]! | (data[offset+1]! << 8); offset += 2
        const bit1       = data[offset]! | (data[offset+1]! << 8); offset += 2
        const pilotLen   = data[offset]! | (data[offset+1]! << 8); offset += 2
        const usedBits   = data[offset++]!
        const pauseMs    = data[offset]! | (data[offset+1]! << 8); offset += 2
        const length     = data[offset]! | (data[offset+1]! << 8) | (data[offset+2]! << 16); offset += 3
        const blockData  = data.slice(offset, offset + length); offset += length

        blocks.push({
          description: `Turbo: ${describeBlock(blockData)}`,
          pulses: buildTurboPulses(blockData, {
            pilotPulse, sync1, sync2, bit0, bit1, pilotLen, usedBits, pauseMs,
          }),
        })
        break
      }

      // ── 0x12: Pure Tone ───────────────────────────────────────────
      case 0x12: {
        const pulseLen = data[offset]! | (data[offset+1]! << 8); offset += 2
        const count    = data[offset]! | (data[offset+1]! << 8); offset += 2
        const pulses = new Uint32Array(count).fill(pulseLen)
        blocks.push({ description: `Pure tone (${count} × ${pulseLen}T)`, pulses })
        break
      }

      // ── 0x13: Pulse Sequence ──────────────────────────────────────
      case 0x13: {
        const count  = data[offset++]!
        const pulses = new Uint32Array(count)
        for (let i = 0; i < count; i++) {
          pulses[i] = data[offset]! | (data[offset+1]! << 8); offset += 2
        }
        blocks.push({ description: `Pulse sequence (${count} pulses)`, pulses })
        break
      }

      // ── 0x14: Pure Data Block ─────────────────────────────────────
      case 0x14: {
        const bit0     = data[offset]! | (data[offset+1]! << 8); offset += 2
        const bit1     = data[offset]! | (data[offset+1]! << 8); offset += 2
        const usedBits = data[offset++]!
        const pauseMs  = data[offset]! | (data[offset+1]! << 8); offset += 2
        const length   = data[offset]! | (data[offset+1]! << 8) | (data[offset+2]! << 16); offset += 3
        const blockData = data.slice(offset, offset + length); offset += length
        blocks.push({
          description: `Pure data (${length} bytes)`,
          pulses: buildPureDataPulses(blockData, { bit0, bit1, usedBits, pauseMs }),
        })
        break
      }

      // ── 0x20: Pause / Stop the Tape ───────────────────────────────
      case 0x20: {
        const pauseMs = data[offset]! | (data[offset+1]! << 8); offset += 2
        if (pauseMs > 0) {
          const pulses = new Uint32Array(1)
          pulses[0] = pauseMs * 3500
          blocks.push({ description: `Pause ${pauseMs}ms`, pulses })
        }
        break
      }

      // ── 0x21: Group Start / 0x22: Group End (metadata) ────────────
      case 0x21: { const len = data[offset++]!; offset += len; break }
      case 0x22: break

      // ── 0x30: Text Description ────────────────────────────────────
      case 0x30: { const len = data[offset++]!; offset += len; break }

      // ── 0x32: Archive Info ────────────────────────────────────────
      case 0x32: {
        const len = data[offset]! | (data[offset+1]! << 8); offset += 2 + len
        break
      }

      // ── 0x35: Custom Info ─────────────────────────────────────────
      case 0x35: {
        offset += 16  // identifier (16 bytes)
        const len = data[offset]! | (data[offset+1]! << 8) | (data[offset+2]! << 16) | (data[offset+3]! << 24)
        offset += 4 + len
        break
      }

      // ── 0x5A: Glue Block ──────────────────────────────────────────
      case 0x5a: { offset += 9; break }

      // ── Unknown block: skip using length field (most unknown blocks
      //    have a 4-byte length at offset 0 after the block ID) ──────
      default: {
        if (offset + 4 <= data.length) {
          const len = data[offset]! | (data[offset+1]! << 8) |
                      (data[offset+2]! << 16) | (data[offset+3]! << 24)
          offset += 4 + len
        } else {
          offset = data.length  // give up
        }
        break
      }
    }
  }

  return blocks
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

interface TurboParams {
  pilotPulse: number; sync1: number; sync2: number
  bit0: number; bit1: number; pilotLen: number
  usedBits: number; pauseMs: number
}

function buildTurboPulses(data: Uint8Array, p: TurboParams): Uint32Array {
  const dataBits   = (data.length - 1) * 8 + p.usedBits
  const totalPulses = p.pilotLen + 2 + dataBits * 2 + (p.pauseMs > 0 ? 1 : 0)
  const pulses = new Uint32Array(totalPulses)
  let pi = 0

  for (let i = 0; i < p.pilotLen; i++) pulses[pi++] = p.pilotPulse
  pulses[pi++] = p.sync1
  pulses[pi++] = p.sync2

  for (let b = 0; b < data.length; b++) {
    const bits = b === data.length - 1 ? p.usedBits : 8
    const byte = data[b]!
    for (let bit = 7; bit >= 8 - bits; bit--) {
      const pulse = (byte >> bit) & 1 ? p.bit1 : p.bit0
      pulses[pi++] = pulse
      pulses[pi++] = pulse
    }
  }

  if (p.pauseMs > 0) pulses[pi++] = p.pauseMs * 3500

  return pulses.slice(0, pi)
}

interface PureDataParams {
  bit0: number; bit1: number; usedBits: number; pauseMs: number
}

function buildPureDataPulses(data: Uint8Array, p: PureDataParams): Uint32Array {
  const dataBits   = (data.length - 1) * 8 + p.usedBits
  const totalPulses = dataBits * 2 + (p.pauseMs > 0 ? 1 : 0)
  const pulses = new Uint32Array(totalPulses)
  let pi = 0

  for (let b = 0; b < data.length; b++) {
    const bits = b === data.length - 1 ? p.usedBits : 8
    const byte = data[b]!
    for (let bit = 7; bit >= 8 - bits; bit--) {
      const pulse = (byte >> bit) & 1 ? p.bit1 : p.bit0
      pulses[pi++] = pulse
      pulses[pi++] = pulse
    }
  }

  if (p.pauseMs > 0) pulses[pi++] = p.pauseMs * 3500

  return pulses.slice(0, pi)
}
