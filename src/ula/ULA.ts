import { Memory } from '../memory/Memory.js'
import { decodeAttr, writePixel } from './palette.js'

/**
 * ULA – Uncommitted Logic Array
 *
 * Responsible for:
 *  - Rendering the 256×192 pixel screen from VRAM
 *  - Managing the border colour (I/O port 0xFE bits 2-0)
 *  - Flash timing (~1.56 Hz = toggles every 16 frames at 50 Hz)
 *  - Producing an ImageData-compatible pixel buffer for Canvas
 *
 * ── Screen memory layout ──────────────────────────────────────────
 *
 *  Bitmap  : 0x4000–0x57FF (6144 bytes)
 *  Attrs   : 0x5800–0x5AFF  (768 bytes)
 *
 *  The bitmap address for pixel (x, y) is NOT linear.
 *  The 256×192 screen is divided into 3 vertical thirds (0-63, 64-127, 128-191).
 *  Within each third, scanlines are interleaved by character row:
 *
 *    Address bits: 0 1 0  Y7 Y6  Y2 Y1 Y0  Y5 Y4 Y3  X4 X3 X2 X1 X0
 *                  ─────  ─────  ──────────  ──────────  ──────────────
 *                  fixed  third  pixel-row   char-row    byte column
 *
 *  Attribute address for cell (cx, cy):  0x5800 + cy*32 + cx
 *    cx = x >> 3    (0..31)
 *    cy = y >> 3    (0..23)
 *
 * ── Canvas layout ────────────────────────────────────────────────
 *
 *  Total canvas: (256 + 2*borderW) × (192 + 2*borderH)  pixels
 *  Default border: 32px each side → 320×256 canvas
 */

export const SCREEN_W  = 256
export const SCREEN_H  = 192
export const BORDER_W  = 32   // pixels, left and right
export const BORDER_H  = 24   // pixels, top and bottom
export const CANVAS_W  = SCREEN_W + BORDER_W * 2   // 320
export const CANVAS_H  = SCREEN_H + BORDER_H * 2   // 240

/** Total T-states per frame (50 Hz, 3.5 MHz Z80) */
export const TSTATES_PER_FRAME = 69888

/** Flash toggles every 16 frames (~1.56 Hz at 50 Hz) */
const FLASH_FRAMES = 16

export class ULA {
  /** Raw RGBA pixel buffer (CANVAS_W × CANVAS_H × 4 bytes) */
  readonly pixels = new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4)

  private borderColour = 7   // White by default (bits 2-0 of port 0xFE)
  private flashPhase   = false
  private frameCount   = 0

  constructor(private readonly mem: Memory) {}

  // ─────────────────────────────────────────────────────────────────
  // I/O port write (called by CPU when it writes to port 0xFE)
  // ─────────────────────────────────────────────────────────────────

  writePort(value: number): void {
    this.borderColour = value & 0x07
  }

  getBorderColour(): number {
    return this.borderColour
  }

  // ─────────────────────────────────────────────────────────────────
  // Bitmap address decoder
  //
  //  The Spectrum bitmap address encodes y and x in a non-linear way:
  //
  //  Bit:  15 14 13  12  11  10  9   8   7   6   5   4   3   2   1   0
  //         0  1  0  y7  y6  y2  y1  y0  y5  y4  y3  x4  x3  x2  x1  x0
  //
  //  Where y7:y6 = third (0,1,2), y5:y3 = char row within third,
  //  y2:y0 = pixel row within character
  // ─────────────────────────────────────────────────────────────────

  static bitmapAddress(x: number, y: number): number {
    const y210 = y & 0x07         // bits 2-0 of y  (pixel row inside char)
    const y543 = (y >> 3) & 0x07  // bits 5-3 of y  (char row inside third)
    const y76  = (y >> 6) & 0x03  // bits 7-6 of y  (which third)
    const xByte = (x >> 3) & 0x1f // column byte 0-31

    return 0x4000 |
      (y76  << 11) |
      (y210 << 8)  |
      (y543 << 5)  |
      xByte
  }

  static attrAddress(x: number, y: number): number {
    const cx = (x >> 3) & 0x1f
    const cy = (y >> 3) & 0x1f
    return 0x5800 + cy * 32 + cx
  }

  // ─────────────────────────────────────────────────────────────────
  // Full frame render — call once per 50 Hz tick
  // ─────────────────────────────────────────────────────────────────

  renderFrame(): void {
    this.frameCount++
    if (this.frameCount >= FLASH_FRAMES) {
      this.frameCount = 0
      this.flashPhase = !this.flashPhase
    }

    this.renderBorder()
    this.renderScreen()
  }

  // ─────────────────────────────────────────────────────────────────
  // Border
  // ─────────────────────────────────────────────────────────────────

  private renderBorder(): void {
    // Border uses only normal brightness (no BRIGHT flag)
    const borderRGBA = this.getBorderRGBA()
    const totalPixels = CANVAS_W * CANVAS_H

    // Top border
    for (let i = 0; i < CANVAS_W * BORDER_H; i++) {
      writePixel(this.pixels, i * 4, borderRGBA)
    }
    // Bottom border
    const bottomStart = (BORDER_H + SCREEN_H) * CANVAS_W
    for (let i = bottomStart; i < totalPixels; i++) {
      writePixel(this.pixels, i * 4, borderRGBA)
    }
    // Left and right strips on screen rows
    for (let row = 0; row < SCREEN_H; row++) {
      const rowStart = (BORDER_H + row) * CANVAS_W
      // Left
      for (let col = 0; col < BORDER_W; col++) {
        writePixel(this.pixels, (rowStart + col) * 4, borderRGBA)
      }
      // Right
      for (let col = BORDER_W + SCREEN_W; col < CANVAS_W; col++) {
        writePixel(this.pixels, (rowStart + col) * 4, borderRGBA)
      }
    }
  }

  private getBorderRGBA(): number {
    // Import inline to avoid circular deps
    const NORMAL_PALETTE = [
      0x000000ff, 0x0000d7ff, 0xd70000ff, 0xd700d7ff,
      0x00d700ff, 0x00d7d7ff, 0xd7d700ff, 0xd7d7d7ff,
    ]
    return NORMAL_PALETTE[this.borderColour] ?? 0xd7d7d7ff
  }

  // ─────────────────────────────────────────────────────────────────
  // Screen pixels
  // ─────────────────────────────────────────────────────────────────

  private renderScreen(): void {
    for (let y = 0; y < SCREEN_H; y++) {
      const bitmapBase = ULA.bitmapAddress(0, y)
      const attrBase   = ULA.attrAddress(0, y)

      for (let xByte = 0; xByte < 32; xByte++) {
        const bitmap = this.mem.read(bitmapBase + xByte)
        const attr   = this.mem.read(attrBase   + xByte)
        const { ink, paper } = decodeAttr(attr, this.flashPhase)

        for (let bit = 7; bit >= 0; bit--) {
          const pixelSet = (bitmap >> bit) & 1
          const rgba     = pixelSet ? ink : paper

          const screenX  = xByte * 8 + (7 - bit)
          const screenY  = y
          const canvasX  = BORDER_W + screenX
          const canvasY  = BORDER_H + screenY
          const offset   = (canvasY * CANVAS_W + canvasX) * 4

          writePixel(this.pixels, offset, rgba)
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Accessors for tests / renderer
  // ─────────────────────────────────────────────────────────────────

  isFlashPhase(): boolean { return this.flashPhase }
  getFrameCount(): number { return this.frameCount }

  /** Force flash phase for snapshot restore */
  setFlashPhase(phase: boolean): void { this.flashPhase = phase }
}
