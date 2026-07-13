import { describe, it, expect } from 'vitest'
import { Kempston } from '../../src/io/Kempston.js'

describe('Kempston joystick', () => {
  it('starts with all bits clear (no input)', () => {
    expect(new Kempston().read()).toBe(0x00)
  })

  it('ArrowRight sets bit 0', () => {
    const k = new Kempston()
    k.keyDown('ArrowRight')
    expect(k.read() & 0x01).toBe(1)
  })

  it('ArrowLeft sets bit 1', () => {
    const k = new Kempston()
    k.keyDown('ArrowLeft')
    expect(k.read() & 0x02).toBe(2)
  })

  it('ArrowDown sets bit 2', () => {
    const k = new Kempston()
    k.keyDown('ArrowDown')
    expect(k.read() & 0x04).toBe(4)
  })

  it('ArrowUp sets bit 3', () => {
    const k = new Kempston()
    k.keyDown('ArrowUp')
    expect(k.read() & 0x08).toBe(8)
  })

  it('AltLeft sets bit 4 (fire)', () => {
    const k = new Kempston()
    k.keyDown('AltLeft')
    expect(k.read() & 0x10).toBe(0x10)
  })

  it('AltRight sets bit 4 (fire)', () => {
    const k = new Kempston()
    k.keyDown('AltRight')
    expect(k.read() & 0x10).toBe(0x10)
  })

  it('keyUp clears the bit', () => {
    const k = new Kempston()
    k.keyDown('ArrowRight')
    k.keyUp('ArrowRight')
    expect(k.read()).toBe(0x00)
  })

  it('multiple keys pressed simultaneously', () => {
    const k = new Kempston()
    k.keyDown('ArrowUp')
    k.keyDown('AltLeft')
    expect(k.read()).toBe(0x08 | 0x10)
  })

  it('reset clears all state', () => {
    const k = new Kempston()
    k.keyDown('ArrowUp'); k.keyDown('ArrowRight'); k.keyDown('AltLeft')
    k.reset()
    expect(k.read()).toBe(0x00)
  })

  it('bits 5-7 are always 0', () => {
    const k = new Kempston()
    k.keyDown('ArrowUp'); k.keyDown('ArrowRight')
    expect(k.read() & 0xe0).toBe(0x00)
  })
})
