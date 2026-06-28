import { describe, it, expect, beforeEach } from 'vitest'
import { Keyboard } from '../../src/io/Keyboard.js'

describe('Keyboard – no keys pressed', () => {
  it('all rows return 0xFF (bits 7-5 set + all 5 key bits = 1)', () => {
    const kbd = new Keyboard()
    for (let row = 0; row < 8; row++) {
      // Select only this row: address bit = 0 for that row, 1 for others
      const portHigh = ~(1 << row) & 0xff
      expect(kbd.read(portHigh)).toBe(0xff)
    }
  })

  it('selecting all rows at once (portHigh=0x00) returns 0xFF', () => {
    const kbd = new Keyboard()
    expect(kbd.read(0x00)).toBe(0xff)
  })

  it('selecting no rows (portHigh=0xFF) returns 0xFF', () => {
    const kbd = new Keyboard()
    expect(kbd.read(0xff)).toBe(0xff)
  })
})

describe('Keyboard – single key press', () => {
  it('Space (row 7, bit 0) pressed → bit 0 clears in row 7 read', () => {
    const kbd = new Keyboard()
    kbd.keyDown('Space')
    // Select row 7: portHigh bit 7 = 0 → portHigh = 0x7F
    const result = kbd.read(0x7f)
    expect(result & 0x01).toBe(0)   // bit 0 cleared = pressed
    expect(result & 0xe0).toBe(0xe0) // top 3 bits always set
  })

  it('Enter (row 6, bit 0) pressed → bit 0 clears in row 6', () => {
    const kbd = new Keyboard()
    kbd.keyDown('Enter')
    const result = kbd.read(0xbf)  // bit 6 low → 0xBF
    expect(result & 0x01).toBe(0)
  })

  it('Shift (row 0, bit 0) pressed', () => {
    const kbd = new Keyboard()
    kbd.keyDown('ShiftLeft')
    const result = kbd.read(0xfe)  // bit 0 low → 0xFE
    expect(result & 0x01).toBe(0)
  })

  it('A key (row 1, bit 0) pressed', () => {
    const kbd = new Keyboard()
    kbd.keyDown('KeyA')
    const result = kbd.read(0xfd)  // bit 1 low → 0xFD
    expect(result & 0x01).toBe(0)
  })

  it('5 key (row 3, bit 4) pressed', () => {
    const kbd = new Keyboard()
    kbd.keyDown('Digit5')
    const result = kbd.read(0xf7)  // bit 3 low → 0xF7
    expect(result & 0x10).toBe(0)  // bit 4 cleared
  })
})

describe('Keyboard – key release', () => {
  it('key released returns to 1', () => {
    const kbd = new Keyboard()
    kbd.keyDown('Space')
    kbd.keyUp('Space')
    const result = kbd.read(0x7f)
    expect(result & 0x01).toBe(1)
  })

  it('releasing one key does not affect another in same row', () => {
    const kbd = new Keyboard()
    kbd.keyDown('KeyZ')   // row 0, bit 1
    kbd.keyDown('KeyX')   // row 0, bit 2
    kbd.keyUp('KeyZ')
    const result = kbd.read(0xfe)  // row 0
    expect(result & 0x02).toBe(0x02)  // Z released → bit 1 = 1
    expect(result & 0x04).toBe(0x00)  // X still pressed → bit 2 = 0
  })
})

describe('Keyboard – multi-row read', () => {
  it('pressing keys in two rows, selecting both rows at once', () => {
    const kbd = new Keyboard()
    kbd.keyDown('Space')    // row 7, bit 0
    kbd.keyDown('Enter')    // row 6, bit 0
    // Select both rows 6 and 7: portHigh = 0x3F (bits 7 and 6 both low)
    const result = kbd.read(0x3f)
    expect(result & 0x01).toBe(0)  // bit 0 clear (both rows have bit 0 pressed)
  })

  it('selecting a row with no pressed keys returns 0xFF', () => {
    const kbd = new Keyboard()
    kbd.keyDown('Space')    // row 7
    // Read row 0 (nothing pressed there)
    const result = kbd.read(0xfe)
    expect(result).toBe(0xff)
  })
})

describe('Keyboard – reset', () => {
  it('reset clears all pressed keys', () => {
    const kbd = new Keyboard()
    kbd.keyDown('Space')
    kbd.keyDown('Enter')
    kbd.keyDown('ShiftLeft')
    kbd.reset()
    for (let row = 0; row < 8; row++) {
      const portHigh = ~(1 << row) & 0xff
      expect(kbd.read(portHigh)).toBe(0xff)
    }
  })
})

describe('Keyboard – ShiftRight maps to same row as ShiftLeft', () => {
  it('both Shift keys map to row 0 bit 0', () => {
    const kbd = new Keyboard()
    kbd.keyDown('ShiftRight')
    expect(kbd.read(0xfe) & 0x01).toBe(0)
  })
})
