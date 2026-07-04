import { describe, it, expect } from 'vitest'
import { CPU }          from '../../src/cpu/CPU.js'
import { Memory }       from '../../src/memory/Memory.js'
import { Disassembler } from '../../src/debugger/Disassembler.js'

function makeDisasm(program: number[]): Disassembler {
  const mem = new Memory()
  program.forEach((b, i) => mem.poke(i, b))
  return new Disassembler(mem)
}

describe('Disassembler — main opcodes', () => {
  it('NOP', () => {
    const d = makeDisasm([0x00])
    expect(d.disassemble(0, 1)[0]!.mnem).toBe('NOP')
  })

  it('LD BC,nn', () => {
    const d = makeDisasm([0x01, 0x34, 0x12])
    const line = d.disassemble(0, 1)[0]!
    expect(line.mnem).toBe('LD BC,1234h')
    expect(line.bytes).toEqual([0x01, 0x34, 0x12])
  })

  it('LD A,n', () => {
    expect(makeDisasm([0x3e, 0xff]).disassemble(0,1)[0]!.mnem).toBe('LD A,FFh')
  })

  it('HALT', () => {
    expect(makeDisasm([0x76]).disassemble(0,1)[0]!.mnem).toBe('HALT')
  })

  it('JP nn', () => {
    expect(makeDisasm([0xc3,0x00,0x80]).disassemble(0,1)[0]!.mnem).toBe('JP 8000h')
  })

  it('JR e (forward)', () => {
    expect(makeDisasm([0x18, 0x05]).disassemble(0,1)[0]!.mnem).toBe('JR 0007h')
  })

  it('JR e (backward)', () => {
    // JR -2 = 0xFE → relative to PC+2 = 0, so lands at 0x0000
    expect(makeDisasm([0x18, 0xfe]).disassemble(0,1)[0]!.mnem).toBe('JR 0000h')
  })

  it('CALL nn + RET', () => {
    const d = makeDisasm([0xcd, 0x00, 0x40, 0xc9])
    const lines = d.disassemble(0, 2)
    expect(lines[0]!.mnem).toBe('CALL 4000h')
    expect(lines[1]!.mnem).toBe('RET')
  })

  it('ADD A,B', () => {
    expect(makeDisasm([0x80]).disassemble(0,1)[0]!.mnem).toBe('ADD A,B')
  })

  it('XOR A', () => {
    expect(makeDisasm([0xaf]).disassemble(0,1)[0]!.mnem).toBe('XOR A')
  })

  it('CP n', () => {
    expect(makeDisasm([0xfe, 0x20]).disassemble(0,1)[0]!.mnem).toBe('CP 20h')
  })

  it('LD (HL),A', () => {
    expect(makeDisasm([0x77]).disassemble(0,1)[0]!.mnem).toBe('LD (HL),A')
  })

  it('OUT (n),A', () => {
    expect(makeDisasm([0xd3, 0xfe]).disassemble(0,1)[0]!.mnem).toBe('OUT (FEh),A')
  })

  it('IN A,(n)', () => {
    expect(makeDisasm([0xdb, 0xfe]).disassemble(0,1)[0]!.mnem).toBe('IN A,(FEh)')
  })

  it('EX AF,AF\'', () => {
    expect(makeDisasm([0x08]).disassemble(0,1)[0]!.mnem).toBe("EX AF,AF'")
  })
})

describe('Disassembler — CB prefix', () => {
  it('RLC B',  () => expect(makeDisasm([0xcb,0x00]).disassemble(0,1)[0]!.mnem).toBe('RLC B'))
  it('BIT 3,A',() => expect(makeDisasm([0xcb,0x5f]).disassemble(0,1)[0]!.mnem).toBe('BIT 3,A'))
  it('SET 7,L',() => expect(makeDisasm([0xcb,0xfd]).disassemble(0,1)[0]!.mnem).toBe('SET 7,L'))
  it('RES 0,B',() => expect(makeDisasm([0xcb,0x80]).disassemble(0,1)[0]!.mnem).toBe('RES 0,B'))
})

describe('Disassembler — ED prefix', () => {
  it('LDIR',   () => expect(makeDisasm([0xed,0xb0]).disassemble(0,1)[0]!.mnem).toBe('LDIR'))
  it('LDDR',   () => expect(makeDisasm([0xed,0xb8]).disassemble(0,1)[0]!.mnem).toBe('LDDR'))
  it('IM 1',   () => expect(makeDisasm([0xed,0x56]).disassemble(0,1)[0]!.mnem).toBe('IM 1'))
  it('IM 2',   () => expect(makeDisasm([0xed,0x5e]).disassemble(0,1)[0]!.mnem).toBe('IM 2'))
  it('RETI',   () => expect(makeDisasm([0xed,0x4d]).disassemble(0,1)[0]!.mnem).toBe('RETI'))
  it('SBC HL,DE',()=> expect(makeDisasm([0xed,0x52]).disassemble(0,1)[0]!.mnem).toBe('SBC HL,DE'))
  it('LD (nn),BC',()=> expect(makeDisasm([0xed,0x43,0x00,0x50]).disassemble(0,1)[0]!.mnem).toBe('LD (5000h),BC'))
})

describe('Disassembler — DD/FD prefix (IX/IY)', () => {
  it('LD IX,nn',    () => expect(makeDisasm([0xdd,0x21,0x00,0x40]).disassemble(0,1)[0]!.mnem).toBe('LD IX,4000h'))
  it('LD IY,nn',    () => expect(makeDisasm([0xfd,0x21,0xff,0x5b]).disassemble(0,1)[0]!.mnem).toBe('LD IY,5BFFh'))
  it('LD A,(IX+5)', () => expect(makeDisasm([0xdd,0x7e,0x05]).disassemble(0,1)[0]!.mnem).toBe('LD A,(IX+5)'))
  it('LD A,(IX-3)', () => expect(makeDisasm([0xdd,0x7e,0xfd]).disassemble(0,1)[0]!.mnem).toBe('LD A,(IX-3)'))
  it('LD (IY+0),B', () => expect(makeDisasm([0xfd,0x70,0x00]).disassemble(0,1)[0]!.mnem).toBe('LD (IY+0),B'))
  it('ADD A,(IX+1)',() => expect(makeDisasm([0xdd,0x86,0x01]).disassemble(0,1)[0]!.mnem).toBe('ADD A,(IX+1)'))
  it('PUSH IX',     () => expect(makeDisasm([0xdd,0xe5]).disassemble(0,1)[0]!.mnem).toBe('PUSH IX'))
  it('JP (IY)',     () => expect(makeDisasm([0xfd,0xe9]).disassemble(0,1)[0]!.mnem).toBe('JP (IY)'))
  it('BIT 0,(IX+2)',() => expect(makeDisasm([0xdd,0xcb,0x02,0x46]).disassemble(0,1)[0]!.mnem).toBe('BIT 0,(IX+2)'))
})

describe('Disassembler — multi-instruction sequences', () => {
  it('correct byte counts advance PC properly', () => {
    // LD A,n (2) + ADD A,B (1) + JP nn (3) = 6 bytes total
    const d = makeDisasm([0x3e,0x01, 0x80, 0xc3,0x00,0x10])
    const lines = d.disassemble(0, 3)
    expect(lines[0]!.addr).toBe(0)
    expect(lines[0]!.bytes.length).toBe(2)
    expect(lines[1]!.addr).toBe(2)
    expect(lines[1]!.bytes.length).toBe(1)
    expect(lines[2]!.addr).toBe(3)
    expect(lines[2]!.bytes.length).toBe(3)
  })
})
