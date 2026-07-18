import { describe, it, expect } from 'vitest'
import { parseTZX } from '../../src/tape/TZXParser.js'
import { PILOT_PULSE, SYNC1_PULSE } from '../../src/tape/TapeBlock.js'

function makeTZX(blocks: Uint8Array[]): Uint8Array {
  const header = new Uint8Array([
    0x5A,0x58,0x54,0x61,0x70,0x65,0x21,
    0x1a, 1, 20,
  ])
  const total = header.length + blocks.reduce((s, b) => s + b.length, 0)
  const out = new Uint8Array(total)
  out.set(header, 0)
  let off = header.length
  for (const b of blocks) { out.set(b, off); off += b.length }
  return out
}

function block0x10(pauseMs: number, data: number[]): Uint8Array {
  const b = new Uint8Array(5 + data.length)
  b[0] = 0x10
  b[1] = pauseMs & 0xff; b[2] = (pauseMs >> 8) & 0xff
  b[3] = data.length & 0xff; b[4] = (data.length >> 8) & 0xff
  b.set(data, 5)
  return b
}

function block0x20(pauseMs: number): Uint8Array {
  return new Uint8Array([0x20, pauseMs & 0xff, (pauseMs >> 8) & 0xff])
}

describe('TZX parser — header validation', () => {
  it('rejects invalid magic', () => {
    expect(() => parseTZX(new Uint8Array(20))).toThrow('Not a valid TZX file')
  })

  it('parses empty but valid TZX', () => {
    expect(parseTZX(makeTZX([]))).toHaveLength(0)
  })
})

describe('TZX parser — block 0x10 (standard speed)', () => {
  it('parses a single standard block', () => {
    const data = [0x00, ...new Array(18).fill(0x00)]
    const tzx = makeTZX([block0x10(1000, data)])
    const blocks = parseTZX(tzx)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.description).toContain('Header')
  })

  it('generates pilot pulses', () => {
    const data = [0xff, 0xAA]
    const tzx = makeTZX([block0x10(500, data)])
    const blocks = parseTZX(tzx)
    expect(blocks[0]!.pulses[0]).toBe(PILOT_PULSE)
  })

  it('pause 0ms generates no pause pulse', () => {
    const data = [0xff, 0x00]
    const tzx = makeTZX([block0x10(0, data)])
    const blocks = parseTZX(tzx)
    const pulses = blocks[0]!.pulses
    const lastPulse = pulses[pulses.length - 1]
    expect(lastPulse).not.toBe(0)
  })
})

describe('TZX parser — block 0x20 (pause)', () => {
  it('creates a pause block with correct T-states', () => {
    const tzx = makeTZX([block0x20(1000)])
    const blocks = parseTZX(tzx)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.pulses[0]).toBe(1000 * 3500)
  })

  it('zero pause generates no block', () => {
    const tzx = makeTZX([block0x20(0)])
    expect(parseTZX(tzx)).toHaveLength(0)
  })
})

describe('TZX parser — metadata blocks (skip)', () => {
  it('skips 0x30 text description', () => {
    const text = [0x30, 5, 72,101,108,108,111]
    const data = [0xff, 0x01]
    const tzx = makeTZX([new Uint8Array(text), block0x10(100, data)])
    const blocks = parseTZX(tzx)
    expect(blocks).toHaveLength(1)
  })

  it('skips 0x5A glue block', () => {
    const glue = new Uint8Array([0x5a, 0,0,0,0,0,0,0,0,0])
    const data = [0xff, 0x01]
    const tzx = makeTZX([glue, block0x10(100, data)])
    const blocks = parseTZX(tzx)
    expect(blocks).toHaveLength(1)
  })

  it('parses multiple blocks in sequence', () => {
    const h = [0x00, ...new Array(18).fill(0x00)]
    const d = [0xff, 0x01, 0x02]
    const tzx = makeTZX([block0x10(1000, h), block0x20(500), block0x10(0, d)])
    const blocks = parseTZX(tzx)
    expect(blocks).toHaveLength(3)
    expect(blocks[0]!.description).toContain('Header')
    expect(blocks[1]!.description).toContain('Pause')
    expect(blocks[2]!.description).toContain('Data')
  })
})
