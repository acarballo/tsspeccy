import { describe, it, expect, vi } from 'vitest'
import { TapePlayer }             from '../../src/tape/TapePlayer.js'
import { type TapeBlock }         from '../../src/tape/TapeBlock.js'

// Minimal stubs — turboLoad lives in FrameLoop which needs a real browser
// environment (rAF, canvas). We test the TapePlayer mechanics directly.

function makeBlock(pulses: number[], desc = 'Test'): TapeBlock {
  return { description: desc, pulses: new Uint32Array(pulses) }
}

/** Simulate turboLoad logic: run tape at max speed until finished */
function simulateTurbo(tape: TapePlayer, maxFrames = 10000): number {
  const TSTATES_PER_FRAME = 69888
  let frames = 0
  while (tape.state === 'playing' && frames < maxFrames) {
    tape.advanceTstates(TSTATES_PER_FRAME)
    frames++
  }
  return frames
}

describe('Turbo load — TapePlayer mechanics', () => {
  it('small tape (few pulses) finishes in one frame', () => {
    const tape = new TapePlayer()
    // 10 short pulses — far less than one frame's worth of T-states
    tape.load([makeBlock([100, 100, 100, 100, 100, 100, 100, 100, 100, 100])])
    tape.play()
    const frames = simulateTurbo(tape)
    expect(tape.state).toBe('finished')
    expect(frames).toBe(1)
  })

  it('tape finishes before safety limit', () => {
    const tape = new TapePlayer()
    // Simulate a realistic tape: pilot (8063 × 2168T) + data
    // Total ≈ 8063×2168 ≈ 17.5M T-states ≈ 250 frames
    const pilotPulses  = new Array(8063).fill(2168)
    const syncAndData  = [667, 735, ...new Array(200).fill(855)]
    const pause        = [3_500_000]
    const allPulses    = [...pilotPulses, ...syncAndData, ...pause]
    tape.load([makeBlock(allPulses, 'Header block')])
    tape.play()
    const frames = simulateTurbo(tape, 10000)
    expect(tape.state).toBe('finished')
    expect(frames).toBeLessThan(500)  // should finish in under 500 frames
  })

  it('multi-block tape: all blocks load in turbo', () => {
    const tape = new TapePlayer()
    tape.load([
      makeBlock([1000, 1000, 1000], 'Block 0'),
      makeBlock([2000, 2000],       'Block 1'),
      makeBlock([500],              'Block 2'),
    ])
    tape.play()
    simulateTurbo(tape)
    expect(tape.state).toBe('finished')
  })

  it('turbo from middle of tape still reaches finished', () => {
    const tape = new TapePlayer()
    tape.load([
      makeBlock([100], 'Block 0'),
      makeBlock([200], 'Block 1'),
      makeBlock([300], 'Block 2'),
    ])
    tape.play()
    // Manually advance past block 0
    tape.advanceTstates(200)
    // Now turbo the rest
    simulateTurbo(tape)
    expect(tape.state).toBe('finished')
  })

  it('rewind + turbo replays from start', () => {
    const tape = new TapePlayer()
    tape.load([makeBlock([100, 200, 300])])
    tape.play()
    simulateTurbo(tape)
    expect(tape.state).toBe('finished')

    // Rewind and turbo again
    tape.rewind()
    tape.play()
    simulateTurbo(tape)
    expect(tape.state).toBe('finished')
  })

  it('EAR bit toggles during turbo (CPU can read it)', () => {
    const tape = new TapePlayer()
    tape.load([makeBlock([1000, 1000, 1000, 1000])])
    tape.play()

    // Initial level is LOW
    expect(tape.earBit()).toBe(0x00)
    tape.advanceTstates(1001)
    // After first pulse: HIGH
    expect(tape.earBit()).toBe(0x40)
    tape.advanceTstates(1001)
    // After second pulse: LOW again
    expect(tape.earBit()).toBe(0x00)
  })

  it('stopped tape does not advance in turbo', () => {
    const tape = new TapePlayer()
    tape.load([makeBlock([100])])
    // Do NOT call play() — tape stays stopped
    const frames = simulateTurbo(tape, 100)
    expect(tape.state).toBe('stopped')
    expect(frames).toBe(100)  // hit the limit, tape never advanced
  })

  it('onStateChange fires when turbo finishes', () => {
    const events: string[] = []
    const tape = new TapePlayer()
    tape.onStateChange = (state) => events.push(state)
    tape.load([makeBlock([100, 200])])
    tape.play()
    simulateTurbo(tape)
    expect(events).toContain('finished')
  })
})
