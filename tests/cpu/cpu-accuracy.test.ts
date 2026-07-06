import { describe, it, expect } from 'vitest'
import { CPU }    from '../../src/cpu/CPU.js'
import { Memory } from '../../src/memory/Memory.js'

function makeSystem(program: number[]): { cpu: CPU; mem: Memory } {
  const mem = new Memory()
  program.forEach((b, i) => mem.poke(i, b))
  const cpu = new CPU(mem)
  cpu.regs.PC = 0x0000
  cpu.regs.R  = 0x00  // start from known state
  return { cpu, mem }
}

// ── R register ────────────────────────────────────────────────────

describe('R register auto-increment', () => {
  it('increments by 1 on each simple opcode fetch', () => {
    const { cpu } = makeSystem([0x00, 0x00, 0x00])  // 3× NOP
    expect(cpu.regs.R).toBe(0x00)
    cpu.step(); expect(cpu.regs.R).toBe(0x01)
    cpu.step(); expect(cpu.regs.R).toBe(0x02)
    cpu.step(); expect(cpu.regs.R).toBe(0x03)
  })

  it('increments by 2 for CB-prefix opcodes (prefix fetch + opcode fetch)', () => {
    const { cpu } = makeSystem([0xcb, 0x00])  // RLC B
    cpu.step()
    expect(cpu.regs.R).toBe(0x02)
  })

  it('increments by 2 for ED-prefix opcodes', () => {
    const { cpu } = makeSystem([0xed, 0x56])  // IM 1
    cpu.step()
    expect(cpu.regs.R).toBe(0x02)
  })

  it('increments by 2 for DD-prefix opcodes (IX)', () => {
    const { cpu } = makeSystem([0xdd, 0x21, 0x00, 0x40])  // LD IX,4000h
    cpu.step()
    expect(cpu.regs.R).toBe(0x02)
  })

  it('increments by 2 for FD-prefix opcodes (IY)', () => {
    const { cpu } = makeSystem([0xfd, 0x21, 0x00, 0x40])  // LD IY,4000h
    cpu.step()
    expect(cpu.regs.R).toBe(0x02)
  })

  it('bit 7 of R is preserved (only bits 0-6 wrap)', () => {
    const { cpu } = makeSystem(new Array(130).fill(0x00))  // 130× NOP
    cpu.regs.R = 0x7e  // bits 0-6 = 0x7e, bit 7 = 0
    cpu.step(); expect(cpu.regs.R).toBe(0x7f)
    cpu.step(); expect(cpu.regs.R).toBe(0x00)  // wraps at 0x7f → 0x00, bit 7 preserved = 0
    cpu.step(); expect(cpu.regs.R).toBe(0x01)
  })

  it('bit 7 preserved when set during wrap', () => {
    const { cpu } = makeSystem(new Array(5).fill(0x00))
    cpu.regs.R = 0xfe  // bit 7 = 1, bits 0-6 = 0x7e
    cpu.step(); expect(cpu.regs.R).toBe(0xff)  // 0x80 | 0x7f
    cpu.step(); expect(cpu.regs.R).toBe(0x80)  // 0x80 | 0x00 (wrapped)
    cpu.step(); expect(cpu.regs.R).toBe(0x81)
  })

  it('LD R,A sets R to A value; subsequent increments preserve bit 7', () => {
    // ED 4F = LD R,A
    // Sequence: step1=LD A,0x80 (R→1), step2=LD R,A (ED fetch R→2, then R=0x80 set by instruction)
    // After LD R,A: R = 0x80 (set from A, bit 7 preserved)
    // NOP: R = 0x80 | 0x01 = 0x81
    const { cpu } = makeSystem([0x3e, 0x80, 0xed, 0x4f, 0x00, 0x00])
    cpu.step()  // LD A,0x80
    cpu.step()  // LD R,A  → R = 0x80 (A value, overrides the auto-increments)
    expect(cpu.regs.R).toBe(0x80)
    cpu.step()  // NOP → R = 0x80 | 0x01 = 0x81
    expect(cpu.regs.R).toBe(0x81)
    cpu.step()  // NOP → R = 0x80 | 0x02 = 0x82
    expect(cpu.regs.R).toBe(0x82)
  })
})

// ── EI delay ─────────────────────────────────────────────────────

describe('EI one-instruction delay', () => {
  it('interrupt NOT accepted immediately after EI — only after next instruction', () => {
    const { cpu } = makeSystem([
      0xf3,       // DI   @0x0000
      0xfb,       // EI   @0x0001  ← IFF1 should NOT be set yet
      0x00,       // NOP  @0x0002  ← IFF1 becomes true after this
      0x76,       // HALT @0x0003
    ])
    cpu.step()  // DI  → IFF1=false
    cpu.step()  // EI  → eiPending=true, IFF1 still false
    expect(cpu.regs.IFF1).toBe(false)  // not yet!

    // Fire interrupt — should be ignored because IFF1 is still false
    const t = cpu.interrupt()
    expect(t).toBe(0)              // interrupt rejected
    expect(cpu.regs.PC).toBe(0x02) // PC still at NOP

    cpu.step()  // NOP — eiPending resolves, IFF1 now true
    expect(cpu.regs.IFF1).toBe(true)

    // NOW interrupt is accepted
    cpu.regs.IM = 1
    cpu.regs.SP = 0x8000
    const t2 = cpu.interrupt()
    expect(t2).toBe(13)
    expect(cpu.regs.PC).toBe(0x0038)
  })

  it('DI after EI cancels the pending enable', () => {
    const { cpu } = makeSystem([
      0xfb,   // EI  @0x0000
      0xf3,   // DI  @0x0001
      0x00,   // NOP @0x0002
    ])
    cpu.step()  // EI  → eiPending=true
    cpu.step()  // DI  → clears eiPending, IFF1=false
    cpu.step()  // NOP → eiPending was false, so IFF1 stays false
    expect(cpu.regs.IFF1).toBe(false)
  })

  it('EI + HALT: interrupt wakes CPU and executes ISR normally', () => {
    // Classic pattern in Spectrum ROM: EI / HALT / (interrupt arrives)
    const mem = new Memory()
    ;[0xfb, 0x76].forEach((b, i) => mem.poke(i, b))  // EI, HALT
    mem.poke(0x0038, 0xed); mem.poke(0x0039, 0x4d)    // ISR: RETI
    const cpu = new CPU(mem)
    cpu.regs.PC = 0; cpu.regs.SP = 0x8000; cpu.regs.IM = 1

    cpu.step()   // EI — eiPending=true, IFF1 still false
    cpu.step()   // HALT — eiPending resolves: IFF1=true, then HALT
    expect(cpu.halted).toBe(true)
    expect(cpu.regs.IFF1).toBe(true)

    cpu.interrupt()  // wakes CPU, jumps to 0x0038
    expect(cpu.halted).toBe(false)
    expect(cpu.regs.PC).toBe(0x0038)

    cpu.step()   // RETI → back to 0x0002 (after HALT)
    expect(cpu.regs.PC).toBe(0x0002)
  })

  it('EI delay does not affect DI — DI is always immediate', () => {
    const { cpu } = makeSystem([0xf3, 0x00])  // DI, NOP
    cpu.regs.IFF1 = true
    cpu.step()  // DI
    expect(cpu.regs.IFF1).toBe(false)  // immediate, no delay

    // Interrupt should be rejected immediately after DI
    const t = cpu.interrupt()
    expect(t).toBe(0)
  })
})
