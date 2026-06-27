/**
 * ZX Spectrum colour palette
 *
 * The Spectrum has 8 base colours × 2 brightness levels = 16 entries.
 * Each attribute byte encodes:
 *   Bit 7   – FLASH  (alternates INK/PAPER at ~1.56 Hz)
 *   Bit 6   – BRIGHT (selects bright palette)
 *   Bits 5-3 – PAPER colour (0-7)
 *   Bits 2-0 – INK colour (0-7)
 *
 * Colour index: bright*8 + colour_number
 */

/** RGBA colour entries for normal and bright palettes */
export const PALETTE: readonly number[] = [
  // Normal brightness (BRIGHT=0)
  0x000000ff, // 0 Black
  0x0000d7ff, // 1 Blue
  0xd70000ff, // 2 Red
  0xd700d7ff, // 3 Magenta
  0x00d700ff, // 4 Green
  0x00d7d7ff, // 5 Cyan
  0xd7d700ff, // 6 Yellow
  0xd7d7d7ff, // 7 White
  // Bright (BRIGHT=1)
  0x000000ff, // 8 Bright Black (same)
  0x0000ffff, // 9 Bright Blue
  0xff0000ff, // 10 Bright Red
  0xff00ffff, // 11 Bright Magenta
  0x00ff00ff, // 12 Bright Green
  0x00ffffff, // 13 Bright Cyan
  0xffff00ff, // 14 Bright Yellow
  0xffffffff, // 15 Bright White
]

/** Decompose an attribute byte into INK and PAPER RGBA values */
export function decodeAttr(attr: number, flashPhase: boolean): { ink: number; paper: number } {
  const bright  = (attr >> 6) & 1
  const flash   = (attr >> 7) & 1
  let inkIdx    = (bright << 3) | (attr & 0x07)
  let paperIdx  = (bright << 3) | ((attr >> 3) & 0x07)

  if (flash && flashPhase) {
    ;[inkIdx, paperIdx] = [paperIdx, inkIdx]
  }

  return {
    ink:   PALETTE[inkIdx]   ?? 0x000000ff,
    paper: PALETTE[paperIdx] ?? 0xffffffff,
  }
}

/** Write an RGBA value into a Uint8ClampedArray at byte offset */
export function writePixel(buf: Uint8ClampedArray, offset: number, rgba: number): void {
  buf[offset]     = (rgba >>> 24) & 0xff  // R
  buf[offset + 1] = (rgba >>> 16) & 0xff  // G
  buf[offset + 2] = (rgba >>> 8)  & 0xff  // B
  buf[offset + 3] = rgba & 0xff           // A
}
