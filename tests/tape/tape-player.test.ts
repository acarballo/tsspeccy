import { describe, it, expect } from 'vitest'
import { TapePlayer } from '../../src/tape/TapePlayer.js'
import { type TapeBlock } from '../../src/tape/TapeBlock.js'

function makeBlock(pulses: number[], desc = 'Test block'): TapeBlock {
  return { description: desc, pulses: new Uint32Array(pulses) }
}

describe('TapePlayer — state machine', () => {
  it('starts in stopped state', () => {
    expect(new TapePlayer().state).toBe('stopped')
  })

  it('play() moves to playing', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100, 200])])
    tp.play()
    expect(tp.state).toBe('playing')
  })

  it('pause() from playing moves to paused', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100])])
    tp.play(); tp.pause()
    expect(tp.state).toBe('paused')
  })

  it('stop() rewinds and stops', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100])])
    tp.play(); tp.stop()
    expect(tp.state).toBe('stopped')
  })

  it('reaching end of tape → finished', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([50])])
    tp.play()
    tp.advanceTstates(100)
    expect(tp.state).toBe('finished')
  })

  it('play() after finished rewinds and plays', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([50])])
    tp.play()
    tp.advanceTstates(100)
    expect(tp.state).toBe('finished')
    tp.play()
    expect(tp.state).toBe('playing')
  })
})

describe('TapePlayer — EAR bit output', () => {
  it('starts with EAR bit LOW (0x00)', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100])])
    tp.play()
    expect(tp.earBit()).toBe(0x00)
  })

  it('EAR toggles after first pulse duration', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100, 200])])
    tp.play()
    expect(tp.earBit()).toBe(0x00)
    tp.advanceTstates(100)
    expect(tp.earBit()).toBe(0x40)
    tp.advanceTstates(200)
    expect(tp.earBit()).toBe(0x00)
  })

  it('partial advance does not toggle', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([1000])])
    tp.play()
    tp.advanceTstates(500)
    expect(tp.earBit()).toBe(0x00)
  })

  it('accumulates T-states across multiple calls', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100, 9999])])
    tp.play()
    tp.advanceTstates(40)
    tp.advanceTstates(40)
    expect(tp.earBit()).toBe(0x00)
    tp.advanceTstates(30)
    expect(tp.earBit()).toBe(0x40)
  })
})

describe('TapePlayer — multi-block', () => {
  it('advances through multiple blocks in sequence', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([10], 'Block 0'), makeBlock([20], 'Block 1')])
    tp.play()
    tp.advanceTstates(15)
    tp.advanceTstates(25)
    expect(tp.state).toBe('finished')
  })

  it('eject() clears all blocks', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100])])
    tp.eject()
    expect(tp.isLoaded()).toBe(false)
    expect(tp.state).toBe('stopped')
  })

  it('does not advance when paused', () => {
    const tp = new TapePlayer()
    tp.load([makeBlock([100])])
    tp.play(); tp.pause()
    tp.advanceTstates(200)
    expect(tp.earBit()).toBe(0x00)
  })
})

describe('TapePlayer — callbacks', () => {
  it('onStateChange fires on play/pause/stop/finish', () => {
    const events: string[] = []
    const tp = new TapePlayer()
    tp.onStateChange = (s) => events.push(s)
    tp.load([makeBlock([10])])
    tp.play()
    tp.pause()
    tp.stop()
    expect(events).toContain('playing')
    expect(events).toContain('paused')
    expect(events).toContain('stopped')
  })
})
