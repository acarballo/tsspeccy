import { ULA, CANVAS_W, CANVAS_H } from './ULA.js'

/**
 * Renderer
 *
 * Bridges the ULA pixel buffer to an HTML5 Canvas.
 * Call renderer.drawFrame() once per 50 Hz tick (after ULA.renderFrame()).
 *
 * Usage:
 *   const canvas = document.getElementById('screen') as HTMLCanvasElement
 *   const renderer = new Renderer(canvas, ula)
 *
 *   // Inside the emulator loop:
 *   ula.renderFrame()
 *   renderer.drawFrame()
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D
  private readonly imageData: ImageData

  constructor(canvas: HTMLCanvasElement, private readonly ula: ULA) {
    canvas.width  = CANVAS_W
    canvas.height = CANVAS_H

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get 2D canvas context')
    this.ctx = ctx

    this.imageData = this.ctx.createImageData(CANVAS_W, CANVAS_H)
  }

  /** Copy ULA pixel buffer → canvas */
  drawFrame(): void {
    this.imageData.data.set(this.ula.pixels)
    this.ctx.putImageData(this.imageData, 0, 0)
  }
}
