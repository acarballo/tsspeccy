import { describe, it, expect } from 'vitest'
import { CPU }    from '../../src/cpu/CPU.js'
import { Memory } from '../../src/memory/Memory.js'

function makeSystem(program: number[]): { cpu: CPU; mem: Memory } {
  const mem = new Memory()
  program.forEach((b, i) => mem.poke(i, b))
  const cpu = new CPU(mem)
  cpu.regs.PC = 0x0000
  cpu.regs.SP = 0x8000
  return { cpu, mem }
}

describe('Maskable interrupt (INT) — IM 1', () => {
  it('does nothing when IFF1 is false (interrupts disabled)', () => {
    const { cpu } = makeSystem([0xf3])  // DI
    cpu.step()  // execute DI
    const pcBefore = cpu.regs.PC
    const t = cpu.interrupt()
    expect(t).toBe(0)
    expect(cpu.regs.PC).toBe(pcBefore)  // unaffected
  })

  it('jumps to 0x0038 in IM 1 when IFF1 is true', () => {
    const { cpu } = makeSystem([0xfb, 0x00, 0x00])  // EI, NOP, NOP
    cpu.step()  // EI  → eiPending=true
    cpu.step()  // NOP → IFF1 now true (delay resolved)
    cpu.regs.IM = 1
    cpu.regs.PC = 0x1234
    const t = cpu.interrupt()
    expect(t).toBe(13)
    expect(cpu.regs.PC).toBe(0x0038)
  })

  it('pushes return address onto the stack', () => {
    const { cpu } = makeSystem([0xfb, 0x00])  // EI, NOP
    cpu.step()  // EI
    cpu.step()  // NOP → IFF1 active
    cpu.regs.IM = 1
    cpu.regs.PC = 0x5555
    cpu.regs.SP = 0x8000
    cpu.interrupt()
    expect(cpu.regs.SP).toBe(0x7ffe)
  })

  it('clears IFF1 and IFF2 after accepting interrupt (so nested INTs are blocked)', () => {
    const { cpu } = makeSystem([0xfb])
    cpu.step()  // EI → IFF1=true, IFF2=true
    cpu.regs.IM = 1
    cpu.interrupt()
    expect(cpu.regs.IFF1).toBe(false)
    expect(cpu.regs.IFF2).toBe(false)
  })

  it('wakes the CPU from HALT', () => {
    const { cpu } = makeSystem([0xfb, 0x76])  // EI, HALT
    cpu.step()  // EI
    cpu.step()  // HALT
    expect(cpu.halted).toBe(true)
    cpu.regs.IM = 1
    cpu.interrupt()
    expect(cpu.halted).toBe(false)
    expect(cpu.regs.PC).toBe(0x0038)
  })
})

describe('Maskable interrupt — IM 2 (vector table)', () => {
  it('reads vector address from (I<<8)|dataBus and jumps there', () => {
    const { cpu, mem } = makeSystem([0xfb, 0x00])  // EI, NOP
    cpu.step()  // EI
    cpu.step()  // NOP → IFF1 active
    cpu.regs.IM = 2
    cpu.regs.I  = 0x40
    // Vector table entry at (0x40 << 8) | 0xFF = 0x40FF
    mem.poke(0x40ff, 0x00)
    mem.poke(0x4100, 0x90)  // ISR address = 0x9000
    cpu.interrupt(0xff)
    expect(cpu.regs.PC).toBe(0x9000)
  })
})

describe('FrameLoop integration — interrupt does not break normal execution', () => {
  it('CPU continues executing normally after an interrupt + RETI', () => {
    // EI, IM 1, HALT — then external interrupt fires, runs RST 38 equivalent (just RET here for test)
    const mem = new Memory()
    ;[
      0xfb,             // EI            @0x0000
      0x76,             // HALT          @0x0001
    ].forEach((b, i) => mem.poke(i, b))
    // ISR at 0x0038: increment a memory counter, then RETI (ED 4D)
    mem.poke(0x0038, 0x3c)        // INC A
    mem.poke(0x0039, 0xed)
    mem.poke(0x003a, 0x4d)        // RETI

    const cpu = new CPU(mem)
    cpu.regs.PC = 0x0000
    cpu.regs.SP = 0x8000
    cpu.regs.IM = 1

    cpu.step()  // EI
    cpu.step()  // HALT
    expect(cpu.halted).toBe(true)

    cpu.interrupt()       // fires INT → jumps to 0x0038
    expect(cpu.regs.PC).toBe(0x0038)

    cpu.step()             // INC A
    expect(cpu.regs.A).toBe(0x00)  // wrapped from 0xFF (initial reset value)

    cpu.step()             // RETI
    expect(cpu.regs.PC).toBe(0x0002) // back after HALT
  })
})
