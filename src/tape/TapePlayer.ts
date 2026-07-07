/**
 * TapePlayer
 *
 * Plays back TapeBlocks by advancing through pulse sequences and
 * providing the current EAR bit level to the IOBus.
 *
 * The IOBus calls earBit() on each port 0xFE read.
 * The FrameLoop calls advanceTstates(n) after each CPU step.
 *
 * State machine:
 *   STOPPED  → no tape loaded or ejected
 *   PLAYING  → advancing through blocks and pulses
 *   PAUSED   → stopped mid-tape (user action)
 *   FINISHED → reached end of tape
 */
import { type TapeBlock } from './TapeBlock.js'

export type TapeState = 'stopped' | 'playing' | 'paused' | 'finished'

export class TapePlayer {
  private blocks: TapeBlock[] = []
  private blockIndex  = 0
  private pulseIndex  = 0
  private tstateCount = 0   // T-states elapsed in current pulse
  private level       = false  // current EAR bit level

  state: TapeState = 'stopped'

  /** Called when tape finishes or a block changes — useful for UI updates */
  onStateChange?: (state: TapeState, blockIndex: number, description: string) => void

  // ─────────────────────────────────────────────────────────────────
  // Load / control
  // ─────────────────────────────────────────────────────────────────

  load(blocks: TapeBlock[]): void {
    this.blocks      = blocks
    this.blockIndex  = 0
    this.pulseIndex  = 0
    this.tstateCount = 0
    this.level       = false
    this.state       = 'stopped'
    this.notifyState()
  }

  play(): void {
    if (this.blocks.length === 0) return
    if (this.state === 'finished') this.rewind()
    this.state = 'playing'
    this.notifyState()
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused'
      this.notifyState()
    }
  }

  stop(): void {
    this.rewind()
    this.state = 'stopped'
    this.notifyState()
  }

  rewind(): void {
    this.blockIndex  = 0
    this.pulseIndex  = 0
    this.tstateCount = 0
    this.level       = false
  }

  eject(): void {
    this.blocks = []
    this.stop()
  }

  isLoaded():  boolean { return this.blocks.length > 0 }
  isPlaying(): boolean { return this.state === 'playing' }

  currentBlock(): TapeBlock | undefined { return this.blocks[this.blockIndex] }
  totalBlocks():  number { return this.blocks.length }

  blockDescription(i: number): string {
    return this.blocks[i]?.description ?? ''
  }

  // ─────────────────────────────────────────────────────────────────
  // Advance — called by FrameLoop after each cpu.step()
  // ─────────────────────────────────────────────────────────────────

  advanceTstates(tstates: number): void {
    if (this.state !== 'playing') return

    this.tstateCount += tstates

    // Consume pulses while we have enough T-states accumulated
    while (this.state === 'playing') {
      const block = this.blocks[this.blockIndex]
      if (!block) { this.finish(); break }

      const pulseDuration = block.pulses[this.pulseIndex]
      if (pulseDuration === undefined) {
        // End of block — move to next
        this.blockIndex++
        this.pulseIndex  = 0
        this.tstateCount = 0
        this.level       = false
        this.notifyState()

        if (this.blockIndex >= this.blocks.length) {
          this.finish(); break
        }
        continue
      }

      if (this.tstateCount < pulseDuration) break

      // Pulse completed — toggle level and advance
      this.tstateCount -= pulseDuration
      this.level        = !this.level
      this.pulseIndex++
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // EAR bit — called by IOBus on port 0xFE reads
  // Returns bit 6 of the port byte (EAR input)
  // ─────────────────────────────────────────────────────────────────

  earBit(): number {
    return this.level ? 0x40 : 0x00
  }

  // ─────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────

  private finish(): void {
    this.state = 'finished'
    this.notifyState()
  }

  private notifyState(): void {
    const desc = this.blocks[this.blockIndex]?.description ?? ''
    this.onStateChange?.(this.state, this.blockIndex, desc)
  }
}
