import type { Memory } from '../memory/Memory.js'

export interface DisasmLine { addr: number; bytes: number[]; mnem: string }

const REG8 = ['B','C','D','E','H','L','(HL)','A']

function hex8(n: number):  string { return n.toString(16).toUpperCase().padStart(2,'0') }
function hex16(n: number): string { return n.toString(16).toUpperCase().padStart(4,'0') }

export class Disassembler {
  constructor(private readonly mem: Memory) {}

  disassemble(addr: number, count: number): DisasmLine[] {
    const lines: DisasmLine[] = []
    let pc = addr & 0xffff
    for (let i = 0; i < count; i++) {
      const line = this.disOne(pc)
      lines.push(line)
      pc = (pc + line.bytes.length) & 0xffff
    }
    return lines
  }

  private rb(a: number) { return this.mem.read(a & 0xffff) }

  private disOne(pc: number): DisasmLine {
    const bytes: number[] = []
    const r  = (): number => { const v = this.rb(pc + bytes.length); bytes.push(v); return v }
    const rw = (): number => { const lo = r(); const hi = r(); return lo|(hi<<8) }
    const rs = (): number => { const v = r(); return v < 0x80 ? v : v-256 }
    const n8  = () => `${hex8(r())}h`
    const n16 = () => `${hex16(rw())}h`
    const jr  = () => { const e=rs(); return `${hex16((pc+2+e)&0xffff)}h` }

    const op = r()
    let mnem = ''

    if (op === 0xcb) {
      const cb = r(); const reg = REG8[cb&7]??'?'; const bit=(cb>>3)&7
      if      (cb<0x08) mnem=`RLC ${reg}`
      else if (cb<0x10) mnem=`RRC ${reg}`
      else if (cb<0x18) mnem=`RL ${reg}`
      else if (cb<0x20) mnem=`RR ${reg}`
      else if (cb<0x28) mnem=`SLA ${reg}`
      else if (cb<0x30) mnem=`SRA ${reg}`
      else if (cb<0x38) mnem=`SLL ${reg}`
      else if (cb<0x40) mnem=`SRL ${reg}`
      else if (cb<0x80) mnem=`BIT ${bit},${reg}`
      else if (cb<0xc0) mnem=`RES ${bit},${reg}`
      else              mnem=`SET ${bit},${reg}`
    } else if (op === 0xed) {
      const ed = r()
      const edMap: Record<number,string> = {
        0x40:'IN B,(C)',  0x41:'OUT (C),B', 0x42:'SBC HL,BC', 0x44:'NEG',
        0x45:'RETN',      0x46:'IM 0',      0x47:'LD I,A',    0x48:'IN C,(C)',
        0x49:'OUT (C),C', 0x4a:'ADC HL,BC', 0x4d:'RETI',      0x4f:'LD R,A',
        0x50:'IN D,(C)',  0x51:'OUT (C),D', 0x52:'SBC HL,DE', 0x56:'IM 1',
        0x57:'LD A,I',    0x58:'IN E,(C)',  0x59:'OUT (C),E', 0x5a:'ADC HL,DE',
        0x5e:'IM 2',      0x5f:'LD A,R',   0x60:'IN H,(C)',  0x61:'OUT (C),H',
        0x62:'SBC HL,HL', 0x67:'RRD',      0x68:'IN L,(C)',  0x69:'OUT (C),L',
        0x6a:'ADC HL,HL', 0x6f:'RLD',      0x72:'SBC HL,SP', 0x78:'IN A,(C)',
        0x79:'OUT (C),A', 0x7a:'ADC HL,SP',
        0xa0:'LDI',  0xa1:'CPI',  0xa2:'INI',  0xa3:'OUTI',
        0xa8:'LDD',  0xa9:'CPD',  0xaa:'IND',  0xab:'OUTD',
        0xb0:'LDIR', 0xb1:'CPIR', 0xb2:'INIR', 0xb3:'OTIR',
        0xb8:'LDDR', 0xb9:'CPDR', 0xba:'INDR', 0xbb:'OTDR',
      }
      if (edMap[ed]) mnem = edMap[ed]!
      else if (ed===0x43) mnem=`LD (${n16()}),BC`
      else if (ed===0x4b) mnem=`LD BC,(${n16()})`
      else if (ed===0x53) mnem=`LD (${n16()}),DE`
      else if (ed===0x5b) mnem=`LD DE,(${n16()})`
      else if (ed===0x63) mnem=`LD (${n16()}),HL`
      else if (ed===0x6b) mnem=`LD HL,(${n16()})`
      else if (ed===0x73) mnem=`LD (${n16()}),SP`
      else if (ed===0x7b) mnem=`LD SP,(${n16()})`
      else mnem=`DB EDh,${hex8(ed)}h`
    } else if (op === 0xdd || op === 0xfd) {
      const xy = op===0xdd?'IX':'IY'; const sub = r()
      const disp = () => { const v=r(); return v<0x80?`+${v}`:`${v-256}` }
      const xyMap: Record<number,(d:()=>string)=>string> = {
        0x09: ()=>`ADD ${xy},BC`,    0x19: ()=>`ADD ${xy},DE`,
        0x21: ()=>`LD ${xy},${n16()}`, 0x22: ()=>`LD (${n16()}),${xy}`,
        0x23: ()=>`INC ${xy}`,       0x24: ()=>`INC ${xy}H`,
        0x25: ()=>`DEC ${xy}H`,      0x26: ()=>`LD ${xy}H,${n8()}`,
        0x29: ()=>`ADD ${xy},${xy}`, 0x2a: ()=>`LD ${xy},(${n16()})`,
        0x2b: ()=>`DEC ${xy}`,       0x2c: ()=>`INC ${xy}L`,
        0x2d: ()=>`DEC ${xy}L`,      0x2e: ()=>`LD ${xy}L,${n8()}`,
        0x34: (d)=>`INC (${xy}${d()})`,  0x35: (d)=>`DEC (${xy}${d()})`,
        0x36: (d)=>`LD (${xy}${d()}),${n8()}`,
        0x39: ()=>`ADD ${xy},SP`,
        0x46: (d)=>`LD B,(${xy}${d()})`, 0x4e: (d)=>`LD C,(${xy}${d()})`,
        0x56: (d)=>`LD D,(${xy}${d()})`, 0x5e: (d)=>`LD E,(${xy}${d()})`,
        0x66: (d)=>`LD H,(${xy}${d()})`, 0x6e: (d)=>`LD L,(${xy}${d()})`,
        0x70: (d)=>`LD (${xy}${d()}),B`, 0x71: (d)=>`LD (${xy}${d()}),C`,
        0x72: (d)=>`LD (${xy}${d()}),D`, 0x73: (d)=>`LD (${xy}${d()}),E`,
        0x74: (d)=>`LD (${xy}${d()}),H`, 0x75: (d)=>`LD (${xy}${d()}),L`,
        0x77: (d)=>`LD (${xy}${d()}),A`, 0x7e: (d)=>`LD A,(${xy}${d()})`,
        0x86: (d)=>`ADD A,(${xy}${d()})`,0x8e: (d)=>`ADC A,(${xy}${d()})`,
        0x96: (d)=>`SUB (${xy}${d()})`,  0x9e: (d)=>`SBC A,(${xy}${d()})`,
        0xa6: (d)=>`AND (${xy}${d()})`,  0xae: (d)=>`XOR (${xy}${d()})`,
        0xb6: (d)=>`OR (${xy}${d()})`,   0xbe: (d)=>`CP (${xy}${d()})`,
        0xe1: ()=>`POP ${xy}`,           0xe3: ()=>`EX (SP),${xy}`,
        0xe5: ()=>`PUSH ${xy}`,          0xe9: ()=>`JP (${xy})`,
        0xf9: ()=>`LD SP,${xy}`,
      }
      if (sub === 0xcb) {
        const dv = disp(); const cb = r(); const bit=(cb>>3)&7; const ea=`(${xy}${dv})`
        if      (cb<0x08) mnem=`RLC ${ea}`
        else if (cb<0x10) mnem=`RRC ${ea}`
        else if (cb<0x18) mnem=`RL ${ea}`
        else if (cb<0x20) mnem=`RR ${ea}`
        else if (cb<0x28) mnem=`SLA ${ea}`
        else if (cb<0x30) mnem=`SRA ${ea}`
        else if (cb<0x40) mnem=`SRL ${ea}`
        else if (cb<0x80) mnem=`BIT ${bit},${ea}`
        else if (cb<0xc0) mnem=`RES ${bit},${ea}`
        else              mnem=`SET ${bit},${ea}`
      } else if (xyMap[sub]) {
        mnem = xyMap[sub]!(disp)
      } else {
        mnem = `DB ${op===0xdd?'DD':'FD'}h,${hex8(sub)}h`
      }
    } else {
      // Main table
      if (op >= 0x40 && op < 0x80 && op !== 0x76) {
        mnem = `LD ${REG8[(op>>3)&7]},${REG8[op&7]}`
      } else if (op >= 0x80 && op < 0xc0) {
        const alu = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP ']
        mnem = `${alu[(op>>3)&7]}${REG8[op&7]}`
      } else {
        const main: Record<number,string|((r:()=>number,rw:()=>number,rs:()=>number)=>string)> = {
          0x00:'NOP', 0x01:(r,rw)=>`LD BC,${n16()}`, 0x02:'LD (BC),A',
          0x03:'INC BC', 0x04:'INC B', 0x05:'DEC B', 0x06:(r)=>`LD B,${n8()}`,
          0x07:'RLCA', 0x08:"EX AF,AF'", 0x09:'ADD HL,BC', 0x0a:'LD A,(BC)',
          0x0b:'DEC BC', 0x0c:'INC C', 0x0d:'DEC C', 0x0e:(r)=>`LD C,${n8()}`,
          0x0f:'RRCA', 0x10:(r,rw,rs)=>`DJNZ ${jr()}`,
          0x11:(r,rw)=>`LD DE,${n16()}`, 0x12:'LD (DE),A',
          0x13:'INC DE', 0x14:'INC D', 0x15:'DEC D', 0x16:(r)=>`LD D,${n8()}`,
          0x17:'RLA', 0x18:(r,rw,rs)=>`JR ${jr()}`, 0x19:'ADD HL,DE',
          0x1a:'LD A,(DE)', 0x1b:'DEC DE', 0x1c:'INC E', 0x1d:'DEC E',
          0x1e:(r)=>`LD E,${n8()}`, 0x1f:'RRA',
          0x20:(r,rw,rs)=>`JR NZ,${jr()}`, 0x21:(r,rw)=>`LD HL,${n16()}`,
          0x22:(r,rw)=>`LD (${n16()}),HL`, 0x23:'INC HL',
          0x24:'INC H', 0x25:'DEC H', 0x26:(r)=>`LD H,${n8()}`, 0x27:'DAA',
          0x28:(r,rw,rs)=>`JR Z,${jr()}`, 0x29:'ADD HL,HL',
          0x2a:(r,rw)=>`LD HL,(${n16()})`, 0x2b:'DEC HL',
          0x2c:'INC L', 0x2d:'DEC L', 0x2e:(r)=>`LD L,${n8()}`, 0x2f:'CPL',
          0x30:(r,rw,rs)=>`JR NC,${jr()}`, 0x31:(r,rw)=>`LD SP,${n16()}`,
          0x32:(r,rw)=>`LD (${n16()}),A`, 0x33:'INC SP',
          0x34:'INC (HL)', 0x35:'DEC (HL)', 0x36:(r)=>`LD (HL),${n8()}`,
          0x37:'SCF', 0x38:(r,rw,rs)=>`JR C,${jr()}`, 0x39:'ADD HL,SP',
          0x3a:(r,rw)=>`LD A,(${n16()})`, 0x3b:'DEC SP',
          0x3c:'INC A', 0x3d:'DEC A', 0x3e:(r)=>`LD A,${n8()}`, 0x3f:'CCF',
          0x76:'HALT',
          0xc0:'RET NZ', 0xc1:'POP BC', 0xc2:(r,rw)=>`JP NZ,${n16()}`,
          0xc3:(r,rw)=>`JP ${n16()}`, 0xc4:(r,rw)=>`CALL NZ,${n16()}`,
          0xc5:'PUSH BC', 0xc6:(r)=>`ADD A,${n8()}`, 0xc7:'RST 00h',
          0xc8:'RET Z', 0xc9:'RET', 0xca:(r,rw)=>`JP Z,${n16()}`,
          0xcc:(r,rw)=>`CALL Z,${n16()}`, 0xcd:(r,rw)=>`CALL ${n16()}`,
          0xce:(r)=>`ADC A,${n8()}`, 0xcf:'RST 08h',
          0xd0:'RET NC', 0xd1:'POP DE', 0xd2:(r,rw)=>`JP NC,${n16()}`,
          0xd3:(r)=>`OUT (${n8()}),A`, 0xd4:(r,rw)=>`CALL NC,${n16()}`,
          0xd5:'PUSH DE', 0xd6:(r)=>`SUB ${n8()}`, 0xd7:'RST 10h',
          0xd8:'RET C', 0xd9:'EXX', 0xda:(r,rw)=>`JP C,${n16()}`,
          0xdb:(r)=>`IN A,(${n8()})`, 0xdc:(r,rw)=>`CALL C,${n16()}`,
          0xde:(r)=>`SBC A,${n8()}`, 0xdf:'RST 18h',
          0xe0:'RET PO', 0xe1:'POP HL', 0xe2:(r,rw)=>`JP PO,${n16()}`,
          0xe3:'EX (SP),HL', 0xe4:(r,rw)=>`CALL PO,${n16()}`,
          0xe5:'PUSH HL', 0xe6:(r)=>`AND ${n8()}`, 0xe7:'RST 20h',
          0xe8:'RET PE', 0xe9:'JP (HL)', 0xea:(r,rw)=>`JP PE,${n16()}`,
          0xeb:'EX DE,HL', 0xec:(r,rw)=>`CALL PE,${n16()}`,
          0xee:(r)=>`XOR ${n8()}`, 0xef:'RST 28h',
          0xf0:'RET P', 0xf1:'POP AF', 0xf2:(r,rw)=>`JP P,${n16()}`,
          0xf3:'DI', 0xf4:(r,rw)=>`CALL P,${n16()}`,
          0xf5:'PUSH AF', 0xf6:(r)=>`OR ${n8()}`, 0xf7:'RST 30h',
          0xf8:'RET M', 0xf9:'LD SP,HL', 0xfa:(r,rw)=>`JP M,${n16()}`,
          0xfb:'EI', 0xfc:(r,rw)=>`CALL M,${n16()}`,
          0xfe:(r)=>`CP ${n8()}`, 0xff:'RST 38h',
        }
        const v = main[op]
        if (typeof v === 'string') mnem = v
        else if (typeof v === 'function') mnem = v(r, rw, rs)
        else mnem = `DB ${hex8(op)}h`
      }
    }

    return { addr: pc, bytes, mnem }
  }
}
