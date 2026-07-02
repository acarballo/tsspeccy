import { describe, it, expect, beforeEach } from 'vitest'
import { CPU }      from '../../src/cpu/CPU.js'
import { Memory }   from '../../src/memory/Memory.js'
import { ULA }      from '../../src/ula/ULA.js'
import { loadZ80 }  from '../../src/snapshot/Z80Snapshot.js'

function makeTarget() {
  const mem = new Memory()
  const ula = new ULA(mem)
  const cpu = new CPU(mem)
  return { regs: cpu.regs, halted: cpu.halted, mem, ula, cpu }
}

/** Build a minimal valid Z80 v1 header (30 bytes) */
function buildV1Header(opts: {
  A?: number; F?: number; BC?: number; DE?: number; HL?: number
  PC?: number; SP?: number; I?: number; R?: number
  IFF1?: boolean; IFF2?: boolean; IM?: number
  border?: number; compressed?: boolean
}): Uint8Array {
  const h = new Uint8Array(30)
  const v = new DataView(h.buffer)
  h[0]  = opts.A ?? 0x00
  h[1]  = opts.F ?? 0x00
  h[2]  = opts.BC ? (opts.BC & 0xff) : 0    // C
  h[3]  = opts.BC ? (opts.BC >> 8)  : 0     // B
  h[4]  = opts.HL ? (opts.HL & 0xff) : 0    // L
  h[5]  = opts.HL ? (opts.HL >> 8)  : 0     // H
  v.setUint16(6, opts.PC ?? 0x1234, true)    // PC
  v.setUint16(8, opts.SP ?? 0x8000, true)    // SP
  h[10] = opts.I ?? 0x3f
  h[11] = opts.R ?? 0x00
  const misc = ((opts.border ?? 7) << 1) | (opts.compressed ? 0x20 : 0x00)
  h[12] = misc
  h[13] = opts.DE ? (opts.DE & 0xff) : 0    // E
  h[14] = opts.DE ? (opts.DE >> 8)  : 0     // D
  h[27] = opts.IFF1 ? 1 : 0
  h[28] = opts.IFF2 ? 1 : 0
  h[29] = opts.IM ?? 1
  return h
}

/** Build a v1 snapshot with uncompressed RAM */
function buildV1(opts: Parameters<typeof buildV1Header>[0], ram?: Uint8Array): Uint8Array {
  const header = buildV1Header({ ...opts, compressed: false })
  const ramData = ram ?? new Uint8Array(49152)
  const snap = new Uint8Array(30 + 49152)
  snap.set(header, 0)
  snap.set(ramData, 30)
  return snap
}

/** Build a v1 snapshot with RLE-compressed RAM */
function buildV1Compressed(
  opts: Parameters<typeof buildV1Header>[0],
  rawRam: Uint8Array,
): Uint8Array {
  // Simple RLE compression: ED ED count byte
  const compressed: number[] = []
  let i = 0
  while (i < rawRam.length) {
    let run = 1
    while (i + run < rawRam.length && rawRam[i + run] === rawRam[i] && run < 255) run++
    if (run >= 3) {
      compressed.push(0xed, 0xed, run, rawRam[i]!)
    } else {
      for (let j = 0; j < run; j++) {
        if (rawRam[i] === 0xed) compressed.push(0xed, 0xed, 1, 0xed)
        else compressed.push(rawRam[i]!)
        i++
      }
      continue
    }
    i += run
  }
  // End marker
  compressed.push(0x00, 0xed, 0xed, 0x00)

  const header = buildV1Header({ ...opts, compressed: true })
  const snap = new Uint8Array(30 + compressed.length)
  snap.set(header, 0)
  snap.set(new Uint8Array(compressed), 30)
  return snap
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Z80 v1 — registers', () => {
  it('restores all main registers from header', () => {
    const snap = buildV1({ A: 0x42, F: 0x55, BC: 0x1234, DE: 0xABCD, HL: 0x5678, PC: 0x8010, SP: 0x7000 })
    const t = makeTarget()
    loadZ80(snap, t)

    expect(t.regs.A).toBe(0x42)
    expect(t.regs.F).toBe(0x55)
    expect(t.regs.BC).toBe(0x1234)
    expect(t.regs.DE).toBe(0xABCD)
    expect(t.regs.HL).toBe(0x5678)
    expect(t.regs.PC).toBe(0x8010)
    expect(t.regs.SP).toBe(0x7000)
  })

  it('restores I, R, IM, IFF1, IFF2', () => {
    const snap = buildV1({ I: 0x3f, R: 0x7a, IM: 1, IFF1: true, IFF2: true })
    const t = makeTarget()
    loadZ80(snap, t)

    expect(t.regs.I).toBe(0x3f)
    expect(t.regs.R & 0x7f).toBe(0x7a)
    expect(t.regs.IM).toBe(1)
    expect(t.regs.IFF1).toBe(true)
    expect(t.regs.IFF2).toBe(true)
  })

  it('restores border colour from misc byte', () => {
    const snap = buildV1({ border: 3 })  // cyan
    const t = makeTarget()
    loadZ80(snap, t)
    expect(t.ula.getBorderColour()).toBe(3)
  })

  it('IFF1=false when byte is 0', () => {
    const snap = buildV1({ IFF1: false, IFF2: false })
    const t = makeTarget()
    loadZ80(snap, t)
    expect(t.regs.IFF1).toBe(false)
  })
})

describe('Z80 v1 — RAM (uncompressed)', () => {
  it('loads RAM into 0x4000–0xFFFF', () => {
    const ram = new Uint8Array(49152)
    ram[0]     = 0xAA   // → 0x4000
    ram[0x3FFF] = 0x55  // → 0x7FFF
    ram[49151] = 0xBB   // → 0xFFFF
    const snap = buildV1({}, ram)
    const t = makeTarget()
    loadZ80(snap, t)

    expect(t.mem.read(0x4000)).toBe(0xAA)
    expect(t.mem.read(0x7fff)).toBe(0x55)
    expect(t.mem.read(0xffff)).toBe(0xBB)
  })

  it('does not overwrite ROM (0x0000–0x3FFF)', () => {
    const t = makeTarget()
    t.mem.poke(0x0000, 0xF3)  // pretend ROM is loaded
    const snap = buildV1({})
    loadZ80(snap, t)
    expect(t.mem.read(0x0000)).toBe(0xF3)  // ROM untouched
  })
})

describe('Z80 v1 — RAM (compressed)', () => {
  it('decompresses RLE runs correctly', () => {
    const ram = new Uint8Array(49152).fill(0x00)
    // Put a run of 10×0xFF starting at offset 0x100 (= address 0x4100)
    for (let i = 0; i < 10; i++) ram[0x100 + i] = 0xff

    const snap = buildV1Compressed({}, ram)
    const t = makeTarget()
    loadZ80(snap, t)

    expect(t.mem.read(0x4100)).toBe(0xff)
    expect(t.mem.read(0x4109)).toBe(0xff)
    expect(t.mem.read(0x410a)).toBe(0x00)
  })
})

describe('Z80 v2 — page-based loading', () => {
  it('loads pages 4, 5, 8 to correct addresses', () => {
    // Build a v2 snapshot manually
    const header = new Uint8Array(30)  // PC=0 → v2/v3
    const extHeader = new Uint8Array(25)  // 2-byte length + 23 bytes
    const v = new DataView(extHeader.buffer)
    v.setUint16(0, 23, true)   // ext len = 23 → v2
    v.setUint16(2, 0x4567, true) // PC

    // Three page blocks: page 8 (screen), page 4, page 5
    function makePage(pageNum: number, fillByte: number): Uint8Array {
      const block = new Uint8Array(3 + 16384)
      const bv = new DataView(block.buffer)
      bv.setUint16(0, 0xffff, true)  // uncompressed
      block[2] = pageNum
      block.fill(fillByte, 3)
      return block
    }

    const page8 = makePage(8, 0x11)  // screen → 0x4000
    const page4 = makePage(4, 0x22)  // → 0x8000
    const page5 = makePage(5, 0x33)  // → 0xC000

    const total = 30 + extHeader.length + page8.length + page4.length + page5.length
    const snap = new Uint8Array(total)
    let off = 0
    snap.set(header,    off); off += 30
    snap.set(extHeader, off); off += extHeader.length
    snap.set(page8,     off); off += page8.length
    snap.set(page4,     off); off += page4.length
    snap.set(page5,     off); off += page5.length

    const t = makeTarget()
    loadZ80(snap, t)

    expect(t.regs.PC).toBe(0x4567)
    expect(t.mem.read(0x4000)).toBe(0x11)  // page 8
    expect(t.mem.read(0x8000)).toBe(0x22)  // page 4
    expect(t.mem.read(0xc000)).toBe(0x33)  // page 5
  })
})
