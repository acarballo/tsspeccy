/**
 * TAPParser
 *
 * Parses .tap files into TapeBlocks.
 *
 * TAP format is very simple — just a sequence of blocks:
 *   [length_lo][length_hi][data × length]
 *   [length_lo][length_hi][data × length]
 *   ...
 *
 * The first byte of data is the flag (0x00=header, 0xFF=data).
 * The last byte is a checksum (XOR of all bytes including flag).
 */
import { type TapeBlock, dataToPulses, describeBlock } from './TapeBlock.js'

export function parseTAP(data: Uint8Array): TapeBlock[] {
  const blocks: TapeBlock[] = []
  let offset = 0

  while (offset + 2 <= data.length) {
    const length = (data[offset]! | (data[offset + 1]! << 8))
    offset += 2

    if (length === 0 || offset + length > data.length) break

    const blockData = data.slice(offset, offset + length)
    offset += length

    blocks.push({
      description: describeBlock(blockData),
      pulses: dataToPulses(blockData),
    })
  }

  return blocks
}

/** Verify TAP block checksum (XOR of all bytes should be 0) */
export function verifyChecksum(data: Uint8Array): boolean {
  let xor = 0
  for (const b of data) xor ^= b
  return xor === 0
}
