import { describe, it, expect } from 'vitest'
import { ULA, CANVAS_W, CANVAS_H, BORDER_W, BORDER_H, SCREEN_W, SCREEN_H } from '../../src/ula/ULA.js'
import { Memory } from '../../src/memory/Memory.js'

function makeULA(): { ula: ULA; mem: Memory } {
  const mem = new Memory()
  const ula = new ULA(mem)
  return { ula, mem }
}

function getPixelRGBA(pixels: Uint8ClampedArray, x: number, y: number): number {
  const off = (y * CANVAS_W + x) * 4
  return ((pixels[off]! << 24) | (pixels[off+1]! << 16) | (pixels[off+2]! << 8) | pixels[off+3]!) >>> 0
}

describe('Canvas dimensions', () => {
  it('pixel buffer is CANVAS_W × CANVAS_H × 4 bytes', () => {
    const { ula } = makeULA()
    expect(ula.pixels.length).toBe(CANVAS_W * CANVAS_H * 4)
  })

  it('CANVAS_W and CANVAS_H include border', () => {
    expect(CANVAS_W).toBe(SCREEN_W + BORDER_W * 2)   // 320
    expect(CANVAS_H).toBe(SCREEN_H + BORDER_H * 2)   // 240
  })
})

describe('Border rendering', () => {
  it('top-left corner pixel is border colour after renderFrame', () => {
    const { ula } = makeULA()
    ula.writePort(0x02) // Red border (colour index 2)
    ula.renderFrame()
    // Top-left pixel is (0,0) — within the border
    const rgba = getPixelRGBA(ula.pixels, 0, 0)
    expect(rgba).toBe(0xd70000ff) // normal red
  })

  it('border colour changes when port 0xFE is written', () => {
    const { ula } = makeULA()
    ula.writePort(0x01) // Blue
    expect(ula.getBorderColour()).toBe(1)
    ula.writePort(0x04) // Green
    expect(ula.getBorderColour()).toBe(4)
  })

  it('border pixel at bottom-right corner', () => {
    const { ula } = makeULA()
    ula.writePort(0x04) // Green
    ula.renderFrame()
    const rgba = getPixelRGBA(ula.pixels, CANVAS_W - 1, CANVAS_H - 1)
    expect(rgba).toBe(0x00d700ff) // normal green
  })
})

describe('Screen pixel rendering', () => {
  it('all-black screen with white attr renders white paper pixels', () => {
    const { ula, mem } = makeULA()
    // Set attribute cell (0,0): INK=0(black), PAPER=7(white), no flash/bright
    // attr = 0b00111000 = 0x38
    mem.poke(0x5800, 0x38)
    // Bitmap byte 0 = 0x00 (all paper pixels)
    mem.poke(0x4000, 0x00)
    ula.renderFrame()
    // First pixel of screen area
    const rgba = getPixelRGBA(ula.pixels, BORDER_W, BORDER_H)
    expect(rgba).toBe(0xd7d7d7ff) // normal white (paper)
  })

  it('all-set bitmap byte renders ink colour', () => {
    const { ula, mem } = makeULA()
    // attr: INK=4(green) PAPER=0(black) = 0x04
    mem.poke(0x5800, 0x04)
    // Bitmap: all 8 pixels set
    mem.poke(0x4000, 0xff)
    ula.renderFrame()
    const rgba = getPixelRGBA(ula.pixels, BORDER_W, BORDER_H)
    expect(rgba).toBe(0x00d700ff) // normal green (ink)
  })

  it('checkerboard byte 0xAA renders alternating ink/paper', () => {
    const { ula, mem } = makeULA()
    // INK=1(blue) PAPER=7(white) = 0x07<<3 | 0x01 = 0x39
    mem.poke(0x5800, 0x39)
    mem.poke(0x4000, 0xAA) // 10101010
    ula.renderFrame()
    // Pixel 0 (bit 7 of 0xAA = 1) → INK = blue
    const p0 = getPixelRGBA(ula.pixels, BORDER_W,     BORDER_H)
    // Pixel 1 (bit 6 of 0xAA = 0) → PAPER = white
    const p1 = getPixelRGBA(ula.pixels, BORDER_W + 1, BORDER_H)
    expect(p0).toBe(0x0000d7ff) // normal blue (ink)
    expect(p1).toBe(0xd7d7d7ff) // normal white (paper)
  })

  it('bottom-right screen cell renders correctly', () => {
    const { ula, mem } = makeULA()
    // Last attr cell: 0x5AFF = PAPER=0(black) INK=7(white) = 0x07
    mem.poke(0x5AFF, 0x07)
    // Bitmap for last row y=191, x=248 (xByte=31)
    const addr = ULA.bitmapAddress(248, 191)
    mem.poke(addr, 0xFF)
    ula.renderFrame()
    // Screen pixel (255, 191) → canvas (BORDER_W+255, BORDER_H+191)
    const rgba = getPixelRGBA(ula.pixels, BORDER_W + 255, BORDER_H + 191)
    expect(rgba).toBe(0xd7d7d7ff) // normal white (ink)
  })
})

describe('Flash', () => {
  it('flash phase toggles after 16 calls to renderFrame', () => {
    const { ula } = makeULA()
    expect(ula.isFlashPhase()).toBe(false)
    for (let i = 0; i < 16; i++) ula.renderFrame()
    expect(ula.isFlashPhase()).toBe(true)
    for (let i = 0; i < 16; i++) ula.renderFrame()
    expect(ula.isFlashPhase()).toBe(false)
  })

  it('flash cell swaps colours when phase is active', () => {
    const { ula, mem } = makeULA()
    // FLASH=1 BRIGHT=0 PAPER=7(white) INK=0(black) = 0b10111000 = 0xB8
    mem.poke(0x5800, 0xB8)
    mem.poke(0x4000, 0x00)  // all PAPER pixels

    ula.setFlashPhase(false)
    ula.renderFrame()
    const normal = getPixelRGBA(ula.pixels, BORDER_W, BORDER_H)

    ula.setFlashPhase(true)
    ula.renderFrame()
    const flashed = getPixelRGBA(ula.pixels, BORDER_W, BORDER_H)

    expect(normal).not.toBe(flashed)
  })
})
