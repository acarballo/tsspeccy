import { describe, it, expect } from 'vitest'
import { CPU }      from '../../src/cpu/CPU.js'
import { Memory }   from '../../src/memory/Memory.js'
import { Keyboard } from '../../src/io/Keyboard.js'
import { IOBus }    from '../../src/io/IOBus.js'
import { ULA }      from '../../src/ula/ULA.js'

function makeSystem() {
  const mem = new Memory()
  const kbd = new Keyboard()
  const ula = new ULA(mem)
  const io  = new IOBus(kbd, ula)
  const cpu = new CPU(mem, io)
  return { mem, kbd, ula, io, cpu }
}

describe('ROM boot diagnostic', () => {

  it('IN A,(0xFE) uses full 16-bit port (A<<8)|0xFE', () => {
    const portsSeen: number[] = []
    const ioBus = { read: (p: number) => { portsSeen.push(p); return 0xff }, write: () => {} }
    const mem = new Memory()
    // LD A,0xFE  →  IN A,(0xFE)  →  HALT
    ;[0x3e, 0xfe, 0xdb, 0xfe, 0x76].forEach((b,i) => mem.poke(i,b))
    const cpu = new CPU(mem, ioBus)
    for (let i=0;i<5;i++) { cpu.step(); if(cpu.halted) break }
    expect(portsSeen).toContain(0xfefe)
  })

  it('Keyboard returns 0xFF on 0xFEFE when no keys pressed (ROM expects this)', () => {
    const kbd = new Keyboard()
    // portHigh = 0xFE → selects row 0
    expect(kbd.read(0xfe)).toBe(0xff)
    // portHigh = 0x7F → selects row 7
    expect(kbd.read(0x7f)).toBe(0xff)
    // portHigh = 0x00 → selects ALL rows
    expect(kbd.read(0x00)).toBe(0xff)
  })

  it('RAM at 0x4000 is writable and readable', () => {
    const { mem } = makeSystem()
    mem.write(0x4000, 0xAA)
    expect(mem.read(0x4000)).toBe(0xAA)
    mem.write(0x7FFF, 0x55)
    expect(mem.read(0x7FFF)).toBe(0x55)
    mem.write(0xFFFF, 0x11)
    expect(mem.read(0xFFFF)).toBe(0x11)
  })

  it('CPU RAM test simulation: XOR A + LD (HL),A + LD A,(HL) → HALT', () => {
    // Mimics what the 48K ROM does at boot
    const { mem, cpu } = makeSystem()
    ;[
      0xF3,             // DI
      0xAF,             // XOR A        → A=0x00
      0x21, 0x00, 0x40, // LD HL,0x4000
      0x77,             // LD (HL),A    → [0x4000] = 0x00
      0x7E,             // LD A,(HL)    → A = [0x4000]
      0xA7,             // AND A        → set Z flag if A=0
      0x20, 0x01,       // JR NZ,+1    → skip HALT if A≠0 (= RAM broken)
      0x76,             // HALT         ← should reach here
      0x18, 0xFE,       // JR -2        ← error loop (should NOT reach)
    ].forEach((b,i) => mem.poke(i,b))
    for (let i=0;i<20;i++) { cpu.step(); if(cpu.halted) break }
    expect(cpu.halted).toBe(true)
    expect(cpu.regs.PC).toBe(11) // HALT is at offset 10, PC advances to 11
  })

  it('LDIR (0xED B0) instruction exists — used extensively by ROM', () => {
    // The ROM uses LDIR to copy data blocks. If unimplemented → NOP → hang.
    const { mem, cpu } = makeSystem()
    ;[
      0x01, 0x05, 0x00, // LD BC, 5   (count)
      0x11, 0x00, 0x60, // LD DE, 0x6000 (dest)
      0x21, 0x00, 0x50, // LD HL, 0x5000 (src)
      0xED, 0xB0,       // LDIR
      0x76,             // HALT
    ].forEach((b,i) => mem.poke(i,b))
    // Write source data
    for (let i=0;i<5;i++) mem.poke(0x5000+i, 0xAA)

    for (let i=0;i<100;i++) { cpu.step(); if(cpu.halted) break }

    // After LDIR: BC=0, DE=0x6005, HL=0x5005, dest filled
    expect(cpu.regs.BC).toBe(0)
    expect(mem.read(0x6000)).toBe(0xAA)
    expect(mem.read(0x6004)).toBe(0xAA)
  })

  it('OTIR (0xED B3) instruction — ROM uses for screen init', () => {
    // OTIR: output (HL) to port C, inc HL, dec B, repeat until B=0
    // If unimplemented this silently fails and ROM hangs
    const portsWritten: number[] = []
    const ioBus = { read: () => 0xff, write: (p: number) => { portsWritten.push(p) } }
    const mem = new Memory()
    ;[
      0x01, 0xFE, 0x03, // LD BC, 0x03FE  (B=3=count, C=0xFE=port)
      0x21, 0x00, 0x60, // LD HL, 0x6000  (src)
      0xED, 0xB3,       // OTIR
      0x76,             // HALT
    ].forEach((b,i) => mem.poke(i,b))
    for (let i=0;i<5;i++) mem.poke(0x6000+i, i+1)
    const cpu = new CPU(mem, ioBus)
    for (let i=0;i<100;i++) { cpu.step(); if(cpu.halted) break }
    expect(cpu.regs.B).toBe(0)
    expect(portsWritten.length).toBe(3)
  })

})
