/**
 * TapeBlock
 *
 * Represents a single block of tape data converted to a sequence of
 * pulse durations (in T-states). This is the common internal format
 * used by both TAP and TZX parsers.
 *
 * ZX Spectrum tape timing constants (T-states at 3.5 MHz):
 *
 *   Pilot tone pulse  : 2168 T-states  (repeated ~8063 times for header, ~3223 for data)
 *   Sync pulse 1      :  667 T-states
 *   Sync pulse 2      :  735 T-states
 *   Bit 0 pulse       :  855 T-states  (two pulses = one bit)
 *   Bit 1 pulse       : 1710 T-states  (two pulses = one bit)
 *   Pause after block :  3,500,000 T-states (1 second)
 */

export const PILOT_PULSE   = 2168
export const SYNC1_PULSE   =  667
export const SYNC2_PULSE   =  735
export const BIT0_PULSE    =  855
export const BIT1_PULSE    = 1710
export const PILOT_HEADER  = 8063   // pilot pulses for a header block
export const PILOT_DATA    = 3223   // pilot pulses for a data block
export const PAUSE_MS      = 1000   // ms pause after each block

/** A tape block as a flat array of pulse durations (T-states each) */
export interface TapeBlock {
  /** Human-readable description, e.g. "Header: BASIC program" */
  description: string
  /** Pulse durations in T-states. Each entry = one half-cycle of the square wave */
  pulses: Uint32Array
}

/**
 * Convert raw byte data (as stored in TAP or TZX block) into pulse durations.
 * flag byte: 0x00 = header, 0xFF = data block
 */
export function dataToPulses(
  data: Uint8Array,
  pauseMs = PAUSE_MS,
  usedBits = 8,         // TZX can have partial last byte
): Uint32Array {
  const isHeader  = data[0] === 0x00
  const pilotLen  = isHeader ? PILOT_HEADER : PILOT_DATA

  // Calculate total pulse count:
  // pilot pulses + 2 sync + (8*2 pulses per byte except last) + (usedBits*2 for last) + pause
  const dataBits  = (data.length - 1) * 8 + usedBits
  const totalPulses = pilotLen + 2 + dataBits * 2 + (pauseMs > 0 ? 1 : 0)

  const pulses = new Uint32Array(totalPulses)
  let pi = 0

  // Pilot tone
  for (let i = 0; i < pilotLen; i++) pulses[pi++] = PILOT_PULSE

  // Sync
  pulses[pi++] = SYNC1_PULSE
  pulses[pi++] = SYNC2_PULSE

  // Data bytes
  for (let b = 0; b < data.length; b++) {
    const bits = b === data.length - 1 ? usedBits : 8
    const byte = data[b]!
    for (let bit = 7; bit >= 8 - bits; bit--) {
      const p = (byte >> bit) & 1 ? BIT1_PULSE : BIT0_PULSE
      pulses[pi++] = p
      pulses[pi++] = p
    }
  }

  // Pause (converted from ms to T-states at 3.5 MHz)
  if (pauseMs > 0) {
    pulses[pi++] = pauseMs * 3500
  }

  return pulses.slice(0, pi)
}

/** Describe a TAP/TZX standard block header */
export function describeBlock(data: Uint8Array): string {
  if (data.length < 2) return 'Unknown block'
  const flag = data[0]
  if (flag === 0x00 && data.length >= 18) {
    // Standard header: flag(1) + type(1) + name(10) + length(2) + param1(2) + param2(2)
    const type = data[1] ?? 0
    const name = String.fromCharCode(...data.slice(2, 12)).trim()
    const typeNames = ['BASIC program', 'Number array', 'String array', 'CODE']
    const typeName = typeNames[type] ?? `Type ${type}`
    return `Header: ${typeName} "${name}"`
  }
  if (flag === 0xff) return `Data block (${data.length - 1} bytes)`
  return `Block flag=0x${flag?.toString(16) ?? '?'}`
}