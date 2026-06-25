import { describe, it, expect, beforeEach } from 'vitest'
import { CPU } from '../../src/cpu/CPU.js'
import { Memory } from '../../src/memory/Memory.js'
import { Flag } from '../../src/cpu/flags.js'

function makeSystem(program: number[]): { cpu: CPU; mem: Memory } {
  const mem = new Memory()
  program.forEach((b, i) => mem.poke(i, b))
  const cpu = new CPU(mem)
  cpu.regs.PC = 0x0000
  return { cpu, mem }
}

function getFlag(cpu: CPU, flag: Flag): boolean {
  return (cpu.regs.F & flag) !== 0
}

// ── ADD A ─────────────────────────────────────────────────────────
describe('ADD A, r', () => {
  it('ADD A,B: basic add', () => {
    const { cpu } = makeSystem([0x3e, 5, 0x06, 3, 0x80])  // LD A,5  LD B,3  ADD A,B
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(8)
    expect(getFlag(cpu, Flag.Z)).toBe(false)
    expect(getFlag(cpu, Flag.C)).toBe(false)
  })

  it('ADD A,B: carry flag on overflow', () => {
    const { cpu } = makeSystem([0x3e, 0xff, 0x06, 0x01, 0x80])
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0x00)
    expect(getFlag(cpu, Flag.Z)).toBe(true)
    expect(getFlag(cpu, Flag.C)).toBe(true)
  })

  it('ADD A,B: zero result sets Z', () => {
    const { cpu } = makeSystem([0x3e, 0, 0x06, 0, 0x80])
    cpu.step(); cpu.step(); cpu.step()
    expect(getFlag(cpu, Flag.Z)).toBe(true)
  })

  it('ADD A,B: half carry', () => {
    const { cpu } = makeSystem([0x3e, 0x0f, 0x06, 0x01, 0x80])
    cpu.step(); cpu.step(); cpu.step()
    expect(getFlag(cpu, Flag.H)).toBe(true)
  })
})

describe('ADD A, n (immediate)', () => {
  it('ADD A,n (0xC6)', () => {
    const { cpu } = makeSystem([0x3e, 10, 0xc6, 5])  // LD A,10  ADD A,5
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(15)
  })
})

// ── SUB ──────────────────────────────────────────────────────────
describe('SUB', () => {
  it('SUB B: basic subtract', () => {
    const { cpu } = makeSystem([0x3e, 10, 0x06, 3, 0x90])  // LD A,10  LD B,3  SUB B
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(7)
    expect(getFlag(cpu, Flag.N)).toBe(true)
    expect(getFlag(cpu, Flag.C)).toBe(false)
  })

  it('SUB B: borrow sets carry', () => {
    const { cpu } = makeSystem([0x3e, 0, 0x06, 1, 0x90])
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0xff)
    expect(getFlag(cpu, Flag.C)).toBe(true)
  })

  it('SUB A: always zero', () => {
    const { cpu } = makeSystem([0x3e, 0x42, 0x97])  // LD A,0x42  SUB A
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0)
    expect(getFlag(cpu, Flag.Z)).toBe(true)
  })
})

// ── CP ───────────────────────────────────────────────────────────
describe('CP', () => {
  it('CP n: equal sets Z, does not change A', () => {
    const { cpu } = makeSystem([0x3e, 0x10, 0xfe, 0x10])  // LD A,0x10  CP 0x10
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0x10)   // A unchanged
    expect(getFlag(cpu, Flag.Z)).toBe(true)
  })

  it('CP n: A>n clears C', () => {
    const { cpu } = makeSystem([0x3e, 5, 0xfe, 3])
    cpu.step(); cpu.step()
    expect(getFlag(cpu, Flag.C)).toBe(false)
  })

  it('CP n: A<n sets C', () => {
    const { cpu } = makeSystem([0x3e, 3, 0xfe, 5])
    cpu.step(); cpu.step()
    expect(getFlag(cpu, Flag.C)).toBe(true)
  })
})

// ── AND / OR / XOR ───────────────────────────────────────────────
describe('AND / OR / XOR', () => {
  it('AND n clears non-matching bits', () => {
    const { cpu } = makeSystem([0x3e, 0b10101010, 0xe6, 0b11001100])
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0b10001000)
    expect(getFlag(cpu, Flag.H)).toBe(true)
    expect(getFlag(cpu, Flag.N)).toBe(false)
  })

  it('OR n combines bits', () => {
    const { cpu } = makeSystem([0x3e, 0b10100000, 0xf6, 0b00001010])
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0b10101010)
  })

  it('XOR A: always zero + resets carry', () => {
    const { cpu } = makeSystem([0x3e, 0x99, 0xaf])  // XOR A
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0x00)
    expect(getFlag(cpu, Flag.Z)).toBe(true)
    expect(getFlag(cpu, Flag.C)).toBe(false)
  })
})

// ── INC / DEC ────────────────────────────────────────────────────
describe('INC / DEC', () => {
  it('INC B (0x04): increments and sets flags', () => {
    const { cpu } = makeSystem([0x06, 0x0f, 0x04])  // LD B,0x0f  INC B
    cpu.step(); cpu.step()
    expect(cpu.regs.B).toBe(0x10)
    expect(getFlag(cpu, Flag.H)).toBe(true)
    expect(getFlag(cpu, Flag.Z)).toBe(false)
  })

  it('INC A wraps 0xFF→0x00 and sets Z', () => {
    const { cpu } = makeSystem([0x3e, 0xff, 0x3c])
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0x00)
    expect(getFlag(cpu, Flag.Z)).toBe(true)
  })

  it('DEC B (0x05): decrements and sets N', () => {
    const { cpu } = makeSystem([0x06, 5, 0x05])
    cpu.step(); cpu.step()
    expect(cpu.regs.B).toBe(4)
    expect(getFlag(cpu, Flag.N)).toBe(true)
  })

  it('DEC B 0x00→0xFF sets overflow', () => {
    const { cpu } = makeSystem([0x06, 0x00, 0x05])
    cpu.step(); cpu.step()
    expect(cpu.regs.B).toBe(0xff)
  })
})

// ── 16-bit ADD ────────────────────────────────────────────────────
describe('ADD HL, rr', () => {
  it('ADD HL,BC (0x09)', () => {
    const { cpu } = makeSystem([0x21, 0x00, 0x10, 0x01, 0x00, 0x20, 0x09])
    cpu.step(); cpu.step(); cpu.step()  // LD HL,0x1000  LD BC,0x2000  ADD HL,BC
    expect(cpu.regs.HL).toBe(0x3000)
    expect(getFlag(cpu, Flag.N)).toBe(false)
  })

  it('ADD HL,HL (0x29) doubles HL', () => {
    const { cpu } = makeSystem([0x21, 0x01, 0x00, 0x29])
    cpu.step(); cpu.step()
    expect(cpu.regs.HL).toBe(0x0002)
  })
})
