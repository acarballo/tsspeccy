import { describe, it, expect, beforeEach } from 'vitest'
import { CPU } from '../../src/cpu/CPU.js'
import { Memory } from '../../src/memory/Memory.js'

// Helper: build a CPU with a program loaded at 0x0000
function makeSystem(program: number[]): { cpu: CPU; mem: Memory } {
  const mem = new Memory()
  // bypass ROM protection for tests
  program.forEach((b, i) => mem.poke(i, b))
  const cpu = new CPU(mem)
  cpu.regs.PC = 0x0000
  return { cpu, mem }
}

describe('LD instructions – 8-bit immediate', () => {
  it('LD B,n (0x06)', () => {
    const { cpu } = makeSystem([0x06, 0x42])
    cpu.step()
    expect(cpu.regs.B).toBe(0x42)
    expect(cpu.regs.PC).toBe(2)
  })

  it('LD C,n (0x0E)', () => {
    const { cpu } = makeSystem([0x0e, 0x10])
    cpu.step()
    expect(cpu.regs.C).toBe(0x10)
  })

  it('LD A,n (0x3E)', () => {
    const { cpu } = makeSystem([0x3e, 0xff])
    cpu.step()
    expect(cpu.regs.A).toBe(0xff)
  })
})

describe('LD instructions – 16-bit immediate', () => {
  it('LD BC,nn (0x01)', () => {
    const { cpu } = makeSystem([0x01, 0x34, 0x12])
    cpu.step()
    expect(cpu.regs.BC).toBe(0x1234)
    expect(cpu.regs.B).toBe(0x12)
    expect(cpu.regs.C).toBe(0x34)
  })

  it('LD HL,nn (0x21)', () => {
    const { cpu } = makeSystem([0x21, 0xcd, 0xab])
    cpu.step()
    expect(cpu.regs.HL).toBe(0xabcd)
  })

  it('LD SP,nn (0x31)', () => {
    const { cpu } = makeSystem([0x31, 0x00, 0x80])
    cpu.step()
    expect(cpu.regs.SP).toBe(0x8000)
  })
})

describe('LD r,r — register-to-register', () => {
  it('LD B,C (0x41)', () => {
    const { cpu } = makeSystem([0x0e, 0x55, 0x41])  // LD C,0x55  then  LD B,C
    cpu.step(); cpu.step()
    expect(cpu.regs.B).toBe(0x55)
  })

  it('LD A,B (0x78)', () => {
    const { cpu } = makeSystem([0x06, 0x99, 0x78])  // LD B,0x99  then  LD A,B
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0x99)
  })
})

describe('LD (HL),n and LD r,(HL)', () => {
  it('LD (HL),n (0x36) stores byte in memory', () => {
    const { cpu, mem } = makeSystem([0x21, 0x00, 0x60, 0x36, 0xAB])
    // LD HL,0x6000  then  LD (HL),0xAB
    cpu.step(); cpu.step()
    expect(mem.read(0x6000)).toBe(0xAB)
  })

  it('LD B,(HL) (0x46) reads from memory', () => {
    const { cpu, mem } = makeSystem([0x21, 0x00, 0x60, 0x46])
    mem.poke(0x6000, 0x77)
    cpu.step(); cpu.step()
    expect(cpu.regs.B).toBe(0x77)
  })
})

describe('LD A,(BC) / LD A,(DE)', () => {
  it('LD A,(BC) (0x0A)', () => {
    const { cpu, mem } = makeSystem([0x01, 0x00, 0x70, 0x0a])
    mem.poke(0x7000, 0x5e)
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0x5e)
  })

  it('LD A,(DE) (0x1A)', () => {
    const { cpu, mem } = makeSystem([0x11, 0x00, 0x70, 0x1a])
    mem.poke(0x7000, 0x3c)
    cpu.step(); cpu.step()
    expect(cpu.regs.A).toBe(0x3c)
  })
})
