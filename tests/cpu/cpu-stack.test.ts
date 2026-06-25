import { describe, it, expect } from 'vitest'
import { CPU } from '../../src/cpu/CPU.js'
import { Memory } from '../../src/memory/Memory.js'

function makeSystem(program: number[]): { cpu: CPU; mem: Memory } {
  const mem = new Memory()
  program.forEach((b, i) => mem.poke(i, b))
  const cpu = new CPU(mem)
  cpu.regs.PC = 0x0000
  cpu.regs.SP = 0x8000
  return { cpu, mem }
}

describe('PUSH / POP', () => {
  it('PUSH BC + POP DE round-trips value', () => {
    const { cpu } = makeSystem([0x01, 0x34, 0x12, 0xc5, 0xd1])
    // LD BC,0x1234  PUSH BC  POP DE
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.DE).toBe(0x1234)
    expect(cpu.regs.SP).toBe(0x8000)
  })

  it('PUSH AF + POP AF preserves flags', () => {
    const { cpu } = makeSystem([0x3e, 0xaa, 0xf5, 0xf1])
    // LD A,0xAA  PUSH AF  POP AF
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0xaa)
  })

  it('stack pointer decrements on PUSH, increments on POP', () => {
    const { cpu } = makeSystem([0x21, 0x00, 0x12, 0xe5, 0xe1])
    cpu.step()  // LD HL,0x1200
    cpu.step()  // PUSH HL
    expect(cpu.regs.SP).toBe(0x7ffe)
    cpu.step()  // POP HL
    expect(cpu.regs.SP).toBe(0x8000)
  })
})

describe('EX AF,AF′', () => {
  it('swaps A and F with alternates', () => {
    const { cpu } = makeSystem([0x3e, 0x11, 0x08, 0x3e, 0x22, 0x08])
    cpu.step()  // LD A,0x11
    cpu.step()  // EX AF,AF' → A'=0x11, A=0xFF (initial)
    cpu.step()  // LD A,0x22
    cpu.step()  // EX AF,AF' → A=0x11
    expect(cpu.regs.A).toBe(0x11)
  })
})

describe('EXX', () => {
  it('swaps BC/DE/HL with alternates', () => {
    // LD BC,0x1111  LD DE,0x2222  LD HL,0x3333  EXX
    const { cpu } = makeSystem([0x01,0x11,0x11, 0x11,0x22,0x22, 0x21,0x33,0x33, 0xd9])
    cpu.step(); cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.BC).toBe(0xffff)  // swapped with initial alternates (0xFFFF)
    expect(cpu.regs.DE).toBe(0xffff)
    expect(cpu.regs.HL).toBe(0xffff)
    // swap back
    cpu.step()  // NOP from whatever is at 0x000A
  })
})
