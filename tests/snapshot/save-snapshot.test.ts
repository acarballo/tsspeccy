import { describe, it, expect } from 'vitest'
import { CPU }      from '../../src/cpu/CPU.js'
import { Memory }   from '../../src/memory/Memory.js'
import { ULA }      from '../../src/ula/ULA.js'
import { saveZ80 }  from '../../src/snapshot/SaveSnapshot.js'
import { loadZ80 }  from '../../src/snapshot/Z80Snapshot.js'

function makeSource() {
  const mem = new Memory()
  const ula = new ULA(mem)
  const cpu = new CPU(mem)
  return { regs: cpu.regs, halted: cpu.halted, mem, ula, cpu }
}

function makeTarget() {
  const mem = new Memory()
  const ula = new ULA(mem)
  const cpu = new CPU(mem)
  return { regs: cpu.regs, halted: cpu.halted, mem, ula, cpu }
}

describe('saveZ80 — output size', () => {
  it('produces exactly 49182 bytes (30 header + 49152 RAM)', () => {
    const src = makeSource()
    const data = saveZ80(src)
    expect(data.length).toBe(30 + 49152)
  })
})

describe('saveZ80 — header registers', () => {
  it('saves A and F', () => {
    const src = makeSource()
    src.regs.A = 0x42; src.regs.F = 0x55
    const data = saveZ80(src)
    expect(data[0]).toBe(0x42)
    expect(data[1]).toBe(0x55)
  })

  it('saves BC, DE, HL', () => {
    const src = makeSource()
    src.regs.BC = 0x1234
    src.regs.DE = 0xABCD
    src.regs.HL = 0x5678
    const data = saveZ80(src)
    expect(data[3]).toBe(0x12) // B
    expect(data[2]).toBe(0x34) // C
    expect(data[14]).toBe(0xAB) // D
    expect(data[13]).toBe(0xCD) // E
    expect(data[5]).toBe(0x56)  // H
    expect(data[4]).toBe(0x78)  // L
  })

  it('saves PC and SP', () => {
    const src = makeSource()
    src.regs.PC = 0x8000
    src.regs.SP = 0xFF00
    const data = saveZ80(src)
    expect(data[6]).toBe(0x00)  // PC lo
    expect(data[7]).toBe(0x80)  // PC hi
    expect(data[8]).toBe(0x00)  // SP lo
    expect(data[9]).toBe(0xFF)  // SP hi
  })

  it('saves IX, IY', () => {
    const src = makeSource()
    src.regs.IX = 0x1111
    src.regs.IY = 0x2222
    const data = saveZ80(src)
    expect(data[25]).toBe(0x11); expect(data[26]).toBe(0x11) // IX
    expect(data[23]).toBe(0x22); expect(data[24]).toBe(0x22) // IY
  })

  it('saves I, R, IM, IFF1, IFF2', () => {
    const src = makeSource()
    src.regs.I    = 0x3f
    src.regs.R    = 0x5A
    src.regs.IM   = 1
    src.regs.IFF1 = true
    src.regs.IFF2 = true
    const data = saveZ80(src)
    expect(data[10]).toBe(0x3f)
    expect(data[11]).toBe(0x5A & 0x7f)  // bits 0-6
    expect(data[27]).toBe(1)  // IFF1
    expect(data[28]).toBe(1)  // IFF2
    expect(data[29]).toBe(1)  // IM
  })

  it('saves R bit 7 in misc byte bit 0', () => {
    const src = makeSource()
    src.regs.R = 0x80  // bit 7 set
    const data = saveZ80(src)
    expect(data[12]! & 0x01).toBe(1)
  })

  it('saves border colour in misc byte bits 3-1', () => {
    const src = makeSource()
    src.ula.setBorderColour(5)  // 5 = cyan
    const data = saveZ80(src)
    expect((data[12]! >> 1) & 0x07).toBe(5)
  })

  it('saves alternate registers', () => {
    const src = makeSource()
    src.regs.A_ = 0xAA; src.regs.F_ = 0xBB
    src.regs.B_ = 0xCC; src.regs.C_ = 0xDD
    src.regs.D_ = 0xEE; src.regs.E_ = 0xFF
    src.regs.H_ = 0x11; src.regs.L_ = 0x22
    const data = saveZ80(src)
    expect(data[21]).toBe(0xAA) // A'
    expect(data[22]).toBe(0xBB) // F'
    expect(data[16]).toBe(0xCC) // B'
    expect(data[15]).toBe(0xDD) // C'
    expect(data[18]).toBe(0xEE) // D'
    expect(data[17]).toBe(0xFF) // E'
    expect(data[20]).toBe(0x11) // H'
    expect(data[19]).toBe(0x22) // L'
  })
})

describe('saveZ80 — RAM', () => {
  it('saves RAM starting at offset 30', () => {
    const src = makeSource()
    src.mem.poke(0x4000, 0xAA)
    src.mem.poke(0x4001, 0xBB)
    src.mem.poke(0xFFFF, 0x55)
    const data = saveZ80(src)
    expect(data[30]).toBe(0xAA)       // 0x4000
    expect(data[31]).toBe(0xBB)       // 0x4001
    expect(data[30 + 0xBFFF]).toBe(0x55) // 0xFFFF
  })

  it('does not include ROM (0x0000-0x3FFF) in output', () => {
    const src = makeSource()
    // ROM area should not appear in the snapshot data
    expect(saveZ80(src).length).toBe(30 + 49152)
    // The first RAM byte in the file corresponds to 0x4000, not 0x0000
  })
})

describe('saveZ80 — round-trip (save then load)', () => {
  it('full round-trip preserves all registers', () => {
    const src = makeSource()
    src.regs.A  = 0x42; src.regs.F  = 0x55
    src.regs.BC = 0x1234; src.regs.DE = 0xABCD; src.regs.HL = 0x5678
    src.regs.IX = 0x1111; src.regs.IY = 0x2222
    src.regs.SP = 0x8000; src.regs.PC = 0x5B00
    src.regs.I  = 0x3f;   src.regs.R  = 0x7a
    src.regs.IM = 1; src.regs.IFF1 = true; src.regs.IFF2 = true
    src.regs.A_ = 0xAA; src.regs.F_ = 0xBB

    const data   = saveZ80(src)
    const target = makeTarget()
    loadZ80(data, target)

    expect(target.regs.A).toBe(0x42)
    expect(target.regs.F).toBe(0x55)
    expect(target.regs.BC).toBe(0x1234)
    expect(target.regs.DE).toBe(0xABCD)
    expect(target.regs.HL).toBe(0x5678)
    expect(target.regs.IX).toBe(0x1111)
    expect(target.regs.IY).toBe(0x2222)
    expect(target.regs.SP).toBe(0x8000)
    expect(target.regs.PC).toBe(0x5B00)
    expect(target.regs.I).toBe(0x3f)
    expect(target.regs.IM).toBe(1)
    expect(target.regs.IFF1).toBe(true)
    expect(target.regs.A_).toBe(0xAA)
    expect(target.regs.F_).toBe(0xBB)
  })

  it('full round-trip preserves RAM contents', () => {
    const src = makeSource()
    src.regs.PC = 0x5B00  // non-zero so loadZ80 detects v1 format correctly
    src.mem.poke(0x4000, 0xDE)
    src.mem.poke(0x8000, 0xAD)
    src.mem.poke(0xFFFF, 0xBE)

    const data   = saveZ80(src)
    const target = makeTarget()
    loadZ80(data, target)

    expect(target.mem.read(0x4000)).toBe(0xDE)
    expect(target.mem.read(0x8000)).toBe(0xAD)
    expect(target.mem.read(0xFFFF)).toBe(0xBE)
  })

  it('round-trip preserves border colour', () => {
    const src = makeSource()
    src.ula.setBorderColour(3)  // magenta
    const data   = saveZ80(src)
    const target = makeTarget()
    loadZ80(data, target)
    expect(target.ula.getBorderColour()).toBe(3)
  })
})
