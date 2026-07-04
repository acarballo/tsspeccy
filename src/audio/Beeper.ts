/**
 * Beeper
 *
 * The ZX Spectrum 48K beeper is a 1-bit speaker driven by bit 4 of
 * port 0xFE. Every time the CPU writes to that port, the speaker
 * toggles between two voltage levels, producing a square wave.
 *
 * Emulation strategy (ScriptProcessorNode / AudioWorklet would be more
 * accurate, but AudioWorkletNode requires a separate .js file which
 * complicates the Vite build). We use a ScriptProcessorNode accumulating
 * level changes per T-state and synthesising audio at fill time.
 *
 * The Spectrum runs at 3,500,000 T-states/second.
 * A typical audio sample rate is 44100 Hz.
 * → 1 audio sample = 3,500,000 / 44100 ≈ 79.4 T-states
 */

const TSTATE_RATE   = 3_500_000   // Z80 clock
const BUFFER_SIZE   = 2048        // ScriptProcessorNode buffer (samples)

export class Beeper {
  private ctx:       AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private gainNode:  GainNode | null = null

  /** Current speaker level: 0 or 1 */
  private level = 0

  /** Ring buffer of (tstate, level) transitions within the current frame */
  private transitions: Array<{ tstate: number; level: number }> = []

  /** T-state of the start of the current audio frame */
  private frameStart = 0

  /** Total T-states per video frame (used for time mapping) */
  private tstatesPerFrame: number

  constructor(tstatesPerFrame = 69888) {
    this.tstatesPerFrame = tstatesPerFrame
  }

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  start(): void {
    if (this.ctx) return

    this.ctx = new AudioContext()

    this.gainNode = this.ctx.createGain()
    this.gainNode.gain.value = 0.3  // volume: 30%
    this.gainNode.connect(this.ctx.destination)

    // ScriptProcessorNode is deprecated but works universally without
    // needing a separate AudioWorklet file. Fine for emulation purposes.
    this.processor = this.ctx.createScriptProcessor(BUFFER_SIZE, 0, 1)
    this.processor.onaudioprocess = (e) => this.fill(e)
    this.processor.connect(this.gainNode)
  }

  stop(): void {
    this.processor?.disconnect()
    this.gainNode?.disconnect()
    this.ctx?.close()
    this.ctx       = null
    this.processor = null
    this.gainNode  = null
    this.transitions = []
  }

  // ─────────────────────────────────────────────────────────────────
  // Called by IOBus on every write to port 0xFE
  // tstate: current CPU T-state within the frame (0 to tstatesPerFrame)
  // ─────────────────────────────────────────────────────────────────

  writePort(value: number, tstate: number): void {
    const newLevel = (value >> 4) & 1
    if (newLevel !== this.level) {
      this.level = newLevel
      this.transitions.push({ tstate, level: newLevel })
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Called by FrameLoop at the end of each video frame
  // Flushes transitions for the next fill() call
  // ─────────────────────────────────────────────────────────────────

  endFrame(frameTstates: number): void {
    this.frameStart = frameTstates
  }

  // ─────────────────────────────────────────────────────────────────
  // ScriptProcessorNode callback — synthesise audio samples
  // ─────────────────────────────────────────────────────────────────

  private fill(e: AudioProcessingEvent): void {
    if (!this.ctx) return
    const out      = e.outputBuffer.getChannelData(0)
    const sampleRate = this.ctx.sampleRate
    const tstatesPerSample = TSTATE_RATE / sampleRate

    let currentLevel = this.level
    let ti = 0  // transition index

    for (let i = 0; i < out.length; i++) {
      const sampleTstate = i * tstatesPerSample

      // Apply any transitions that occurred before this sample
      while (ti < this.transitions.length) {
        const t = this.transitions[ti]!
        if (t.tstate <= sampleTstate) {
          currentLevel = t.level
          ti++
        } else break
      }

      // Square wave: 0 → -0.5, 1 → +0.5
      out[i] = currentLevel === 1 ? 0.5 : -0.5
    }

    // Discard consumed transitions
    this.transitions.splice(0, ti)
  }

  // ─────────────────────────────────────────────────────────────────
  // Resume AudioContext (browsers suspend it until user gesture)
  // ─────────────────────────────────────────────────────────────────

  resume(): void {
    this.ctx?.resume()
  }

  isRunning(): boolean { return this.ctx !== null }
}
