import { describe, it, expect } from 'vitest'
import { ULA, CANVAS_W, CANVAS_H, BORDER_W, BORDER_H, SCREEN_W, SCREEN_H } from '../../src/ula/ULA.js'
import { Memory } from '../../src/memory/Memory.js'

function makeULA(): { ula: ULA; mem: Memory } {
  const mem = new Memory()
  const ula = new ULA(mem)
  return { ula, mem }
}

// ── Bitmap address decoder ────────────────────────────────────────

describe('ULA.bitmapAddress', () => {
  it('pixel (0,0) → 0x4000', () => {
    expect(ULA.bitmapAddress(0, 0)).toBe(0x4000)
  })

  it('pixel (8,0) → 0x4001 (next byte in same row)', () => {
    expect(ULA.bitmapAddress(8, 0)).toBe(0x4001)
  })

  it('pixel (0,1) → 0x4100 (next pixel row within char 0)', () => {
    // y=1: y210=1, y543=0, y76=0  →  0x4000 | (1<<8) = 0x4100
    expect(ULA.bitmapAddress(0, 1)).toBe(0x4100)
  })

  it('pixel (0,8) → 0x4020 (second char row)', () => {
    // y=8: y210=0, y543=1, y76=0  →  0x4000 | (1<<5) = 0x4020
    expect(ULA.bitmapAddress(0, 8)).toBe(0x4020)
  })

  it('pixel (0,64) → 0x4800 (second third)', () => {
    // y=64: y76=1  →  0x4000 | (1<<11) = 0x4800
    expect(ULA.bitmapAddress(0, 64)).toBe(0x4800)
  })

  it('pixel (0,128) → 0x5000 (third third)', () => {
    // y=128: y76=2  →  0x4000 | (2<<11) = 0x5000
    expect(ULA.bitmapAddress(0, 128)).toBe(0x5000)
  })

  it('pixel (248,191) → last byte in screen', () => {
    // x=248 → xByte=31, y=191 → y76=2,y543=7,y210=7
    const addr = ULA.bitmapAddress(248, 191)
    expect(addr).toBeGreaterThanOrEqual(0x4000)
    expect(addr).toBeLessThanOrEqual(0x57ff)
  })

  it('all 6144 bitmap bytes are within 0x4000-0x57FF', () => {
    for (let y = 0; y < SCREEN_H; y++) {
      for (let xByte = 0; xByte < 32; xByte++) {
        const addr = ULA.bitmapAddress(xByte * 8, y)
        expect(addr).toBeGreaterThanOrEqual(0x4000)
        expect(addr).toBeLessThanOrEqual(0x57ff)
      }
    }
  })

  it('all 6144 addresses are unique', () => {
    const seen = new Set<number>()
    for (let y = 0; y < SCREEN_H; y++) {
      for (let xByte = 0; xByte < 32; xByte++) {
        const addr = ULA.bitmapAddress(xByte * 8, y)
        expect(seen.has(addr)).toBe(false)
        seen.add(addr)
      }
    }
    expect(seen.size).toBe(6144)
  })
})

describe('ULA.attrAddress', () => {
  it('cell (0,0) → 0x5800', () => {
    expect(ULA.attrAddress(0, 0)).toBe(0x5800)
  })

  it('cell (8,0) → 0x5801 (next column)', () => {
    expect(ULA.attrAddress(8, 0)).toBe(0x5801)
  })

  it('cell (0,8) → 0x5820 (second row)', () => {
    expect(ULA.attrAddress(0, 8)).toBe(0x5820)
  })

  it('cell (248,184) → 0x5AFF (last cell)', () => {
    expect(ULA.attrAddress(248, 184)).toBe(0x5AFF)
  })
})
