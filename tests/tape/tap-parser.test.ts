import { describe, it, expect } from 'vitest'
import { parseTAP, verifyChecksum } from '../../src/tape/TAPParser.js'
import { PILOT_PULSE, SYNC1_PULSE, SYNC2_PULSE, BIT0_PULSE, BIT1_PULSE } from '../../src/tape/TapeBlock.js'

function makeTAPBlock(...bytes: number[]): Uint8Array {
  const length = bytes.length
  return new Uint8Array([length & 0xff, (length >> 8) & 0xff, ...bytes])
}

function xorBytes(bytes: number[]): number {
  return bytes.reduce((a, b) => a ^ b, 0)
}

describe('TAP parser — basic structure', () => {
  it('parses a single block', () => {
    const data = [0xff, 0xAA, 0xBB]
    const tap = makeTAPBlock(...data, xorBytes(data))
    const blocks = parseTAP(tap)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.description).toContain('Data block')
  })

  it('parses two consecutive blocks', () => {
    const b1 = [0x00, ...new Array(17).fill(0x00)]
    const b2 = [0xff, 0x01, 0x02]
    const xor1 = xorBytes(b1); const xor2 = xorBytes(b2)
    const tap = new Uint8Array([
      ...makeTAPBlock(...b1, xor1),
      ...makeTAPBlock(...b2, xor2),
    ])
    const blocks = parseTAP(tap)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.description).toContain('Header')
    expect(blocks[1]!.description).toContain('Data block')
  })

  it('handles empty TAP file', () => {
    expect(parseTAP(new Uint8Array(0))).toHaveLength(0)
  })

  it('stops at truncated block', () => {
    const tap = new Uint8Array([10, 0, 0xAA, 0xBB, 0xCC])
    const blocks = parseTAP(tap)
    expect(blocks).toHaveLength(0)
  })
})

describe('TAP parser — pulse generation', () => {
  it('header block starts with pilot tone', () => {
    const data = new Array(19).fill(0x00)
    data[0] = 0x00
    const tap = makeTAPBlock(...data)
    const blocks = parseTAP(tap)
    expect(blocks[0]!.pulses[0]).toBe(PILOT_PULSE)
  })

  it('sync pulses follow pilot tone in header block', () => {
    const data = new Array(19).fill(0x00)
    data[0] = 0x00
    const tap = makeTAPBlock(...data)
    const blocks = parseTAP(tap)
    const pulses = blocks[0]!.pulses
    expect(pulses[8063]).toBe(SYNC1_PULSE)
    expect(pulses[8064]).toBe(SYNC2_PULSE)
  })

  it('data block uses fewer pilot pulses (3223)', () => {
    const data = [0xff, 0xAA, 0x55]
    const tap = makeTAPBlock(...data)
    const blocks = parseTAP(tap)
    expect(blocks[0]!.pulses[3222]).toBe(PILOT_PULSE)
    expect(blocks[0]!.pulses[3223]).toBe(SYNC1_PULSE)
  })
})

describe('TAP checksum', () => {
  it('correct checksum verifies', () => {
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    const xor = 0x00 ^ 0x01 ^ 0x02 ^ 0x03
    expect(verifyChecksum(new Uint8Array([...data, xor]))).toBe(true)
  })

  it('wrong checksum fails', () => {
    expect(verifyChecksum(new Uint8Array([0x01, 0x02, 0x00]))).toBe(false)
  })
})
