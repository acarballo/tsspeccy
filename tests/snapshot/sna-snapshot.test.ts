import { describe, it, expect } from 'vitest'
import { CPU }     from '../../src/cpu/CPU.js'
import { Memory }  from '../../src/memory/Memory.js'
import { ULA }     from '../../src/ula/ULA.js'
import { loadSNA } from '../../src/snapshot/SNASnapshot.js'

function makeTarget() {
  const mem = new Memory()
  const ula = new ULA(mem)
  const cpu = new CPU(mem)
  return { regs: cpu.regs, halted: cpu.halted, mem, ula, cpu }
}

/** Build a minimal valid .sna file (49179 bytes) */
function buildSNA(opts: {
  I?: number
  HL_?: number; DE_?: number; BC_?: number; AF_?: number
  HL?:  number; DE?:  number; BC?:  number
  IY?:  number; IX?:  number
  IFF?: boolean; R?: number
  AF?:  number
  SP?:  number; IM?: number; border?: number
  ram?: Uint8Array
  pcOnStack?: number   // will be written at SP in RAM
}): Uint8Array {
  const sna = new Uint8Array(49179)
  const v = new DataView(sna.buffer)

  // 27-byte header
  sna[0]  = opts.I ?? 0x3f
  sna[1]  = opts.HL_ ? (opts.HL_ & 0xff) : 0   // L'
  sna[2]  = opts.HL_ ? (opts.HL_ >> 8)   : 0   // H'
  sna[3]  = opts.DE_ ? (opts.DE_ & 0xff) : 0   // E'
  sna[4]  = opts.DE_ ? (opts.DE_ >> 8)   : 0   // D'
  sna[5]  = opts.BC_ ? (opts.BC_ & 0xff) : 0   // C'
  sna[6]  = opts.BC_ ? (opts.BC_ >> 8)   : 0   // B'
  sna[7]  = opts.AF_ ? (opts.AF_ & 0xff) : 0   // F'
  sna[8]  = opts.AF_ ? (opts.AF_ >> 8)   : 0   // A'
  sna[9]  = opts.HL  ? (opts.HL  & 0xff) : 0   // L
  sna[10] = opts.HL  ? (opts.HL  >> 8)   : 0   // H
  sna[11] = opts.DE  ? (opts.DE  & 0xff) : 0   // E
  sna[12] = opts.DE  ? (opts.DE  >> 8)   : 0   // D
  sna[13] = opts.BC  ? (opts.BC  & 0xff) : 0   // C
  sna[14] = opts.BC  ? (opts.BC  >> 8)   : 0   // B
  v.setUint16(15, opts.IY ?? 0xffff, true)
  v.setUint16(17, opts.IX ?? 0xffff, true)
  sna[19] = opts.IFF ? 0x04 : 0x00
  sna[20] = opts.R  ?? 0x00
  sna[21] = opts.AF ? (opts.AF & 0xff) : 0x00  // F
  sna[22] = opts.AF ? (opts.AF >> 8)   : 0x00  // A
  v.setUint16(23, opts.SP ?? 0x8000, true)
  sna[25] = opts.IM ?? 1
  sna[26] = opts.border ?? 7

  // RAM (49152 bytes at offset 27)
  if (opts.ram) sna.set(opts.ram.slice(0, 49152), 27)

  // Write PC on stack (SNA convention: PC is pushed at SP before snapshot)
  const sp = opts.SP ?? 0x8000
  const pc = opts.pcOnStack ?? 0x5B00
  // SP is in RAM space (0x4000+), so stack offset = SP - 0x4000
  if (sp >= 0x4000) {
    const stackOffset = 27 + (sp - 0x4000)
    sna[stackOffset]     = pc & 0xff
    sna[stackOffset + 1] = (pc >> 8) & 0xff
  }

  return sna
}

describe('SNA — header registers', () => {
  it('restores main registers', () => {
    const t = makeTarget()
    const sna = buildSNA({ AF: 0x4255, BC: 0x1234, DE: 0xABCD, HL: 0x5678, SP: 0x7F00, pcOnStack: 0x8010 })
    loadSNA(sna, t)
    expect(t.regs.A).toBe(0x42)
    expect(t.regs.F).toBe(0x55)
    expect(t.regs.BC).toBe(0x1234)
    expect(t.regs.DE).toBe(0xABCD)
    expect(t.regs.HL).toBe(0x5678)
  })

  it('restores IX, IY, I, R, IM, border', () => {
    const t = makeTarget()
    const sna = buildSNA({ IX: 0x1111, IY: 0x2222, I: 0x3f, R: 0x7a, IM: 1, border: 2 })
    loadSNA(sna, t)
    expect(t.regs.IX).toBe(0x1111)
    expect(t.regs.IY).toBe(0x2222)
    expect(t.regs.I).toBe(0x3f)
    expect(t.regs.R).toBe(0x7a)
    expect(t.regs.IM).toBe(1)
    expect(t.ula.getBorderColour()).toBe(2)
  })

  it('restores alternate registers', () => {
    const t = makeTarget()
    const sna = buildSNA({ AF_: 0xAABB, BC_: 0xCCDD, DE_: 0xEEFF, HL_: 0x1122 })
    loadSNA(sna, t)
    expect(t.regs.A_).toBe(0xAA)
    expect(t.regs.F_).toBe(0xBB)
    expect(t.regs.B_).toBe(0xCC)
    expect(t.regs.C_).toBe(0xDD)
  })

  it('IFF restored from bit 2 of byte 19', () => {
    const t = makeTarget()
    const sna = buildSNA({ IFF: true })
    loadSNA(sna, t)
    expect(t.regs.IFF1).toBe(true)
    expect(t.regs.IFF2).toBe(true)
  })
})

describe('SNA — PC recovery from stack', () => {
  it('reads PC from top of stack and advances SP by 2', () => {
    const t = makeTarget()
    // SP=0x8000 → in RAM offset 0x8000-0x4000=0x4000 → file offset 27+0x4000
    const sna = buildSNA({ SP: 0x8000, pcOnStack: 0x5B00 })
    loadSNA(sna, t)
    expect(t.regs.PC).toBe(0x5B00)
    expect(t.regs.SP).toBe(0x8002)  // popped 2 bytes
  })

  it('different SP and PC values', () => {
    const t = makeTarget()
    const sna = buildSNA({ SP: 0x7FFE, pcOnStack: 0x9000 })
    loadSNA(sna, t)
    expect(t.regs.PC).toBe(0x9000)
    expect(t.regs.SP).toBe(0x8000)
  })
})

describe('SNA — RAM', () => {
  it('loads 49152 bytes starting at 0x4000', () => {
    const t = makeTarget()
    const ram = new Uint8Array(49152)
    ram[0]     = 0xAA  // → 0x4000
    ram[0x3FFF] = 0x55 // → 0x7FFF
    ram[49151] = 0xBB  // → 0xFFFF
    const sna = buildSNA({ ram, SP: 0x8000, pcOnStack: 0x6000 })
    loadSNA(sna, t)
    expect(t.mem.read(0x4000)).toBe(0xAA)
    expect(t.mem.read(0x7FFF)).toBe(0x55)
    expect(t.mem.read(0xFFFF)).toBe(0xBB)
  })

  it('rejects files shorter than 49179 bytes', () => {
    const t = makeTarget()
    const short = new Uint8Array(100)
    expect(() => loadSNA(short, t)).toThrow('SNA file too short')
  })
})

describe('SnapshotLoader — format detection', () => {
  it('detects .z80 and .sna by extension', async () => {
    const { detectFormat } = await import('../../src/snapshot/SnapshotLoader.js')
    expect(detectFormat('game.z80')).toBe('z80')
    expect(detectFormat('game.Z80')).toBe('z80')
    expect(detectFormat('game.sna')).toBe('sna')
    expect(detectFormat('game.SNA')).toBe('sna')
    expect(detectFormat('game.tap')).toBe('unknown')
    expect(detectFormat('game')).toBe('unknown')
  })

  it('throws on unknown format', async () => {
    const { loadSnapshot } = await import('../../src/snapshot/SnapshotLoader.js')
    const t = makeTarget()
    expect(() => loadSnapshot(new Uint8Array(100), 'game.tap', t))
      .toThrow('Unknown snapshot format')
  })
})
