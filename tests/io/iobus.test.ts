import { describe, it, expect } from 'vitest'
import { Keyboard } from '../../src/io/Keyboard.js'
import { IOBus }    from '../../src/io/IOBus.js'
import { ULA }      from '../../src/ula/ULA.js'
import { Memory }   from '../../src/memory/Memory.js'

function makeBus(): { bus: IOBus; kbd: Keyboard; ula: ULA } {
  const mem = new Memory()
  const kbd = new Keyboard()
  const ula = new ULA(mem)
  const bus = new IOBus(kbd, ula)
  return { bus, kbd, ula }
}

describe('IOBus – port decoding', () => {
  it('even port (A0=0) routes to ULA/keyboard on read', () => {
    const { bus } = makeBus()
    // Port 0xFFFE → even, selects all rows (all bits of high byte = 1 → no row selected)
    const result = bus.read(0xfffe)
    expect(result).toBe(0xff)  // no keys pressed
  })

  it('odd port (A0=1) returns 0xFF (floating bus)', () => {
    const { bus } = makeBus()
    expect(bus.read(0x0001)).toBe(0xff)
    expect(bus.read(0xffff)).toBe(0xff)
  })

  it('write to even port updates ULA border colour', () => {
    const { bus, ula } = makeBus()
    // Write 0x02 (red border) to port 0x00FE
    bus.write(0x00fe, 0x02)
    expect(ula.getBorderColour()).toBe(2)
  })

  it('write to odd port does not change border', () => {
    const { bus, ula } = makeBus()
    bus.write(0x00ff, 0x03)
    expect(ula.getBorderColour()).toBe(7)  // default white
  })

  it('keyboard read passes portHigh correctly', () => {
    const { bus, kbd } = makeBus()
    kbd.keyDown('Space')  // row 7, bit 0
    // IN with A=0x7F → port = 0x7FFE → portHigh = 0x7F (bit 7 low → row 7 selected)
    const result = bus.read(0x7ffe)
    expect(result & 0x01).toBe(0)  // Space pressed
  })
})
