import { describe, it, expect } from 'vitest'
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

describe('JP / JR', () => {
  it('JP nn (0xC3): unconditional jump', () => {
    const { cpu } = makeSystem([0xc3, 0x05, 0x00])
    cpu.step()
    expect(cpu.regs.PC).toBe(0x0005)
  })

  it('JR e (0x18): relative jump forward', () => {
    const { cpu } = makeSystem([0x18, 0x03])  // jump +3 from next instruction
    cpu.step()
    expect(cpu.regs.PC).toBe(0x0005)  // 0x02 (after JR) + 3
  })

  it('JR e (0x18): relative jump backward', () => {
    const { cpu } = makeSystem([0x00, 0x00, 0x00, 0x18, 0xfb])  // JR -5
    cpu.regs.PC = 0x0003
    cpu.step()
    expect(cpu.regs.PC).toBe(0x0000)  // 0x05 + (-5)
  })

  it('JR NZ: taken when Z=0', () => {
    const { cpu } = makeSystem([0x3e, 0x01, 0xfe, 0x00, 0x20, 0x01])
    // LD A,1  CP 0  → Z=0  → JR NZ,+1
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.PC).toBe(0x0007)
  })

  it('JR Z: not taken when Z=0', () => {
    const { cpu } = makeSystem([0x3e, 0x01, 0xfe, 0x00, 0x28, 0x05])
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.PC).toBe(0x0006)  // falls through
  })

  it('JR Z: taken when Z=1', () => {
    const { cpu } = makeSystem([0x3e, 0x05, 0xfe, 0x05, 0x28, 0x02])
    cpu.step(); cpu.step(); cpu.step()
    expect(cpu.regs.PC).toBe(0x0008)
  })
})

describe('CALL / RET', () => {
  it('CALL nn + RET', () => {
    // 0000: CALL 0x0010   [0xCD 0x10 0x00]
    // 0010: LD A,0x42     [0x3E 0x42]
    // 0012: RET           [0xC9]
    const mem = new Memory()
    mem.poke(0x0000, 0xcd); mem.poke(0x0001, 0x10); mem.poke(0x0002, 0x00)
    mem.poke(0x0010, 0x3e); mem.poke(0x0011, 0x42)
    mem.poke(0x0012, 0xc9)
    const cpu = new CPU(mem)
    cpu.regs.PC = 0x0000
    cpu.regs.SP = 0x8000

    cpu.step()  // CALL
    expect(cpu.regs.PC).toBe(0x0010)
    expect(cpu.regs.SP).toBe(0x7ffe)

    cpu.step()  // LD A,0x42
    expect(cpu.regs.A).toBe(0x42)

    cpu.step()  // RET
    expect(cpu.regs.PC).toBe(0x0003)
    expect(cpu.regs.SP).toBe(0x8000)
  })
})

describe('DJNZ', () => {
  it('loops B times', () => {
    // LD B,3  / DJNZ -2 (back to itself)
    const { cpu } = makeSystem([0x06, 3, 0x10, 0xfe])
    cpu.step()  // LD B,3
    cpu.step()  // DJNZ: B=2, jump back
    expect(cpu.regs.B).toBe(2)
    expect(cpu.regs.PC).toBe(0x02)
    cpu.step()  // B=1, jump back
    cpu.step()  // B=0, fall through
    expect(cpu.regs.B).toBe(0)
    expect(cpu.regs.PC).toBe(0x04)
  })
})

describe('HALT', () => {
  it('stays halted and returns 4 T-states each call', () => {
    const { cpu } = makeSystem([0x76])
    cpu.step()
    expect(cpu.halted).toBe(true)
    const t = cpu.step()
    expect(t).toBe(4)
    expect(cpu.regs.PC).toBe(0x01)  // PC does not advance
  })
})
