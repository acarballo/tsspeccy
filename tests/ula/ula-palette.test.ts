import { describe, it, expect } from 'vitest'
import { PALETTE, decodeAttr, writePixel } from '../../src/ula/palette.js'

describe('PALETTE', () => {
  it('has 16 entries', () => {
    expect(PALETTE.length).toBe(16)
  })

  it('black is 0x000000ff', () => {
    expect(PALETTE[0]).toBe(0x000000ff)
  })

  it('bright white is 0xffffffff', () => {
    expect(PALETTE[15]).toBe(0xffffffff)
  })

  it('normal white is darker than bright white', () => {
    // Normal white: 0xd7d7d7ff, bright white: 0xffffffff
    expect(PALETTE[7]).toBe(0xd7d7d7ff)
    expect(PALETTE[15]).toBe(0xffffffff)
  })
})

describe('decodeAttr', () => {
  it('INK=7(white) PAPER=0(black) BRIGHT=0 → correct ink/paper', () => {
    // attr: FLASH=0 BRIGHT=0 PAPER=000 INK=111 = 0b00000111 = 0x07
    const { ink, paper } = decodeAttr(0x07, false)
    expect(ink).toBe(0xd7d7d7ff)   // normal white
    expect(paper).toBe(0x000000ff) // black
  })

  it('BRIGHT=1 gives brighter colours', () => {
    // attr: BRIGHT=1 PAPER=0 INK=7 = 0b01000111 = 0x47
    const { ink, paper } = decodeAttr(0x47, false)
    expect(ink).toBe(0xffffffff)   // bright white
    expect(paper).toBe(0x000000ff) // bright black (same as normal)
  })

  it('FLASH=1 swaps INK and PAPER when flashPhase=true', () => {
    // attr: FLASH=1 BRIGHT=0 PAPER=7(white) INK=0(black) = 0b10111000 = 0xB8
    const normal  = decodeAttr(0xb8, false)
    const flashed = decodeAttr(0xb8, true)
    expect(normal.ink).not.toBe(flashed.ink)
    expect(normal.ink).toBe(flashed.paper)
  })

  it('FLASH=0 does not swap regardless of flashPhase', () => {
    const a = decodeAttr(0x07, false)
    const b = decodeAttr(0x07, true)
    expect(a.ink).toBe(b.ink)
    expect(a.paper).toBe(b.paper)
  })
})

describe('writePixel', () => {
  it('writes RGBA bytes in correct order', () => {
    const buf = new Uint8ClampedArray(4)
    writePixel(buf, 0, 0x12345678)
    expect(buf[0]).toBe(0x12) // R
    expect(buf[1]).toBe(0x34) // G
    expect(buf[2]).toBe(0x56) // B
    expect(buf[3]).toBe(0x78) // A
  })
})
