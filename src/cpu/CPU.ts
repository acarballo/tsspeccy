import { Memory } from '../memory/Memory.js'
import { Registers } from './Registers.js'
import { Flag, PARITY_TABLE } from './flags.js'

/** Minimal I/O interface — keeps CPU decoupled from IOBus implementation */
export interface IIOBus {
  read(port: number): number
  write(port: number, value: number): void
}

/** Default no-op bus used when no IOBus is connected (all reads return 0xFF) */
class NullIOBus implements IIOBus {
  read(_port: number): number { return 0xff }
  write(_port: number, _value: number): void { /* noop */ }
}

/**
 * Z80 CPU emulator core.
 *
 * Usage:
 *   const cpu = new CPU(memory, ioBus)
 *   const tStates = cpu.step()   // execute one instruction
 */
export class CPU {
  readonly regs = new Registers()
  halted = false
  tStates = 0  // total T-states elapsed

  /**
   * EI delay: the Z80 does not accept maskable interrupts until the
   * instruction AFTER EI completes. This flag tracks that one-step delay.
   */
  private eiPending = false

  private readonly io: IIOBus

  constructor(private readonly mem: Memory, ioBus?: IIOBus) {
    this.io = ioBus ?? new NullIOBus()
  }

  // ─────────────────────────────────────────────────────────────────
  // Memory helpers
  // ─────────────────────────────────────────────────────────────────

  private rb(addr: number): number { return this.mem.read(addr) }
  private wb(addr: number, v: number): void { this.mem.write(addr, v) }
  private rw(addr: number): number { return this.mem.read16(addr) }
  private ww(addr: number, v: number): void { this.mem.write16(addr, v) }

  /** Fetch byte at PC and advance PC */
  private fetch(): number {
    const v = this.rb(this.regs.PC)
    this.regs.PC = (this.regs.PC + 1) & 0xffff
    return v
  }

  /** Fetch signed byte (for relative jumps) */
  private fetchSigned(): number {
    const v = this.fetch()
    return v < 0x80 ? v : v - 256
  }

  // ─────────────────────────────────────────────────────────────────
  // Stack helpers
  // ─────────────────────────────────────────────────────────────────

  private push(v: number): void {
    this.regs.SP = (this.regs.SP - 2) & 0xffff
    this.ww(this.regs.SP, v)
  }

  private pop(): number {
    const v = this.rw(this.regs.SP)
    this.regs.SP = (this.regs.SP + 2) & 0xffff
    return v
  }

  // ─────────────────────────────────────────────────────────────────
  // Flag helpers
  // ─────────────────────────────────────────────────────────────────

  private setFlag(flag: Flag, cond: boolean): void {
    if (cond) this.regs.F |= flag
    else       this.regs.F &= ~flag & 0xff
  }

  private getFlag(flag: Flag): boolean {
    return (this.regs.F & flag) !== 0
  }

  /** Flags S, Z, F5, F3 based on result byte (no H, N, C touched) */
  private setSZF53(result: number): void {
    const r = result & 0xff
    this.setFlag(Flag.S,  (r & 0x80) !== 0)
    this.setFlag(Flag.Z,  r === 0)
    this.setFlag(Flag.F5, (r & 0x20) !== 0)
    this.setFlag(Flag.F3, (r & 0x08) !== 0)
  }

  // ─────────────────────────────────────────────────────────────────
  // ALU operations
  // ─────────────────────────────────────────────────────────────────

  /** ADD A, n  —  also used for ADD A, r */
  private aluAdd(n: number, withCarry = false): void {
    const carry = withCarry && this.getFlag(Flag.C) ? 1 : 0
    const a = this.regs.A
    const result = a + n + carry
    const r8 = result & 0xff

    this.setFlag(Flag.C,  result > 0xff)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.H,  ((a & 0xf) + (n & 0xf) + carry) > 0xf)
    // Overflow: pos+pos=neg  or  neg+neg=pos
    this.setFlag(Flag.PV, (~(a ^ n) & (a ^ result) & 0x80) !== 0)
    this.setSZF53(r8)

    this.regs.A = r8
  }

  /** SUB A, n  —  also used for CP, SBC */
  private aluSub(n: number, withCarry = false, store = true): void {
    const carry = withCarry && this.getFlag(Flag.C) ? 1 : 0
    const a = this.regs.A
    const result = a - n - carry
    const r8 = result & 0xff

    this.setFlag(Flag.C,  result < 0)
    this.setFlag(Flag.N,  true)
    this.setFlag(Flag.H,  ((a & 0xf) - (n & 0xf) - carry) < 0)
    this.setFlag(Flag.PV, ((a ^ n) & (a ^ result) & 0x80) !== 0)
    this.setSZF53(r8)

    if (store) this.regs.A = r8
  }

  private aluAnd(n: number): void {
    this.regs.A = (this.regs.A & n) & 0xff
    this.regs.F = 0
    this.setSZF53(this.regs.A)
    this.setFlag(Flag.H,  true)
    this.setFlag(Flag.PV, PARITY_TABLE[this.regs.A] ?? false)
  }

  private aluOr(n: number): void {
    this.regs.A = (this.regs.A | n) & 0xff
    this.regs.F = 0
    this.setSZF53(this.regs.A)
    this.setFlag(Flag.PV, PARITY_TABLE[this.regs.A] ?? false)
  }

  private aluXor(n: number): void {
    this.regs.A = (this.regs.A ^ n) & 0xff
    this.regs.F = 0
    this.setSZF53(this.regs.A)
    this.setFlag(Flag.PV, PARITY_TABLE[this.regs.A] ?? false)
  }

  private aluInc(v: number): number {
    const result = (v + 1) & 0xff
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.H,  (v & 0xf) === 0xf)
    this.setFlag(Flag.PV, v === 0x7f)
    this.setSZF53(result)
    return result
  }

  private aluDec(v: number): number {
    const result = (v - 1) & 0xff
    this.setFlag(Flag.N,  true)
    this.setFlag(Flag.H,  (v & 0xf) === 0x0)
    this.setFlag(Flag.PV, v === 0x80)
    this.setSZF53(result)
    return result
  }

  /** ADD HL, rr  (16-bit add, only affects C, H, N) */
  private addHL(rr: number): void {
    const hl = this.regs.HL
    const result = hl + rr
    this.regs.HL = result & 0xffff
    this.setFlag(Flag.C,  result > 0xffff)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.H,  ((hl & 0xfff) + (rr & 0xfff)) > 0xfff)
  }

  // ─────────────────────────────────────────────────────────────────
  // Rotation / shift helpers
  // ─────────────────────────────────────────────────────────────────

  private rlca(): void {
    const c = (this.regs.A & 0x80) !== 0
    this.regs.A = ((this.regs.A << 1) | (c ? 1 : 0)) & 0xff
    this.setFlag(Flag.C, c)
    this.setFlag(Flag.N, false)
    this.setFlag(Flag.H, false)
    this.setFlag(Flag.F5, (this.regs.A & 0x20) !== 0)
    this.setFlag(Flag.F3, (this.regs.A & 0x08) !== 0)
  }

  private rrca(): void {
    const c = (this.regs.A & 0x01) !== 0
    this.regs.A = ((this.regs.A >> 1) | (c ? 0x80 : 0)) & 0xff
    this.setFlag(Flag.C, c)
    this.setFlag(Flag.N, false)
    this.setFlag(Flag.H, false)
    this.setFlag(Flag.F5, (this.regs.A & 0x20) !== 0)
    this.setFlag(Flag.F3, (this.regs.A & 0x08) !== 0)
  }

  private rla(): void {
    const oldC = this.getFlag(Flag.C)
    const c = (this.regs.A & 0x80) !== 0
    this.regs.A = ((this.regs.A << 1) | (oldC ? 1 : 0)) & 0xff
    this.setFlag(Flag.C, c)
    this.setFlag(Flag.N, false)
    this.setFlag(Flag.H, false)
    this.setFlag(Flag.F5, (this.regs.A & 0x20) !== 0)
    this.setFlag(Flag.F3, (this.regs.A & 0x08) !== 0)
  }

  private rra(): void {
    const oldC = this.getFlag(Flag.C)
    const c = (this.regs.A & 0x01) !== 0
    this.regs.A = ((this.regs.A >> 1) | (oldC ? 0x80 : 0)) & 0xff
    this.setFlag(Flag.C, c)
    this.setFlag(Flag.N, false)
    this.setFlag(Flag.H, false)
    this.setFlag(Flag.F5, (this.regs.A & 0x20) !== 0)
    this.setFlag(Flag.F3, (this.regs.A & 0x08) !== 0)
  }

  // ─────────────────────────────────────────────────────────────────
  // Conditional helpers
  // ─────────────────────────────────────────────────────────────────

  /** Evaluate condition code 0-7 (matches opcode encoding) */
  private condition(cc: number): boolean {
    switch (cc & 0x7) {
      case 0: return !this.getFlag(Flag.Z)   // NZ
      case 1: return  this.getFlag(Flag.Z)   // Z
      case 2: return !this.getFlag(Flag.C)   // NC
      case 3: return  this.getFlag(Flag.C)   // C
      case 4: return !this.getFlag(Flag.PV)  // PO
      case 5: return  this.getFlag(Flag.PV)  // PE
      case 6: return !this.getFlag(Flag.S)   // P
      case 7: return  this.getFlag(Flag.S)   // M
      default: return false
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Register-index helpers  (encoding: B=0 C=1 D=2 E=3 H=4 L=5 (HL)=6 A=7)
  // ─────────────────────────────────────────────────────────────────

  private getReg(r: number): number {
    switch (r) {
      case 0: return this.regs.B
      case 1: return this.regs.C
      case 2: return this.regs.D
      case 3: return this.regs.E
      case 4: return this.regs.H
      case 5: return this.regs.L
      case 6: return this.rb(this.regs.HL)
      case 7: return this.regs.A
      default: return 0
    }
  }

  private setReg(r: number, v: number): void {
    switch (r) {
      case 0: this.regs.B = v & 0xff; break
      case 1: this.regs.C = v & 0xff; break
      case 2: this.regs.D = v & 0xff; break
      case 3: this.regs.E = v & 0xff; break
      case 4: this.regs.H = v & 0xff; break
      case 5: this.regs.L = v & 0xff; break
      case 6: this.wb(this.regs.HL, v); break
      case 7: this.regs.A = v & 0xff; break
    }
  }

  private getRR(rr: number): number {
    switch (rr) {
      case 0: return this.regs.BC
      case 1: return this.regs.DE
      case 2: return this.regs.HL
      case 3: return this.regs.SP
      default: return 0
    }
  }

  private setRR(rr: number, v: number): void {
    switch (rr) {
      case 0: this.regs.BC = v & 0xffff; break
      case 1: this.regs.DE = v & 0xffff; break
      case 2: this.regs.HL = v & 0xffff; break
      case 3: this.regs.SP = v & 0xffff; break
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CB-prefix: bit operations
  // ─────────────────────────────────────────────────────────────────

  private executeCB(): number {
    const op = this.fetch()
    this.regs.R = (this.regs.R & 0x80) | ((this.regs.R + 1) & 0x7f)
    const reg = op & 0x07
    const bit = (op >> 3) & 0x07
    let v = this.getReg(reg)
    let cycles = reg === 6 ? 15 : 8

    if (op < 0x40) {
      // rotates / shifts
      let c: boolean
      switch ((op >> 3) & 0x07) {
        case 0: c = (v & 0x80) !== 0; v = ((v << 1) | (c ? 1 : 0)) & 0xff
                this.setFlag(Flag.C, c); break  // RLC
        case 1: c = (v & 0x01) !== 0; v = ((v >> 1) | (c ? 0x80 : 0)) & 0xff
                this.setFlag(Flag.C, c); break  // RRC
        case 2: c = (v & 0x80) !== 0; v = ((v << 1) | (this.getFlag(Flag.C) ? 1 : 0)) & 0xff
                this.setFlag(Flag.C, c); break  // RL
        case 3: c = (v & 0x01) !== 0; v = ((v >> 1) | (this.getFlag(Flag.C) ? 0x80 : 0)) & 0xff
                this.setFlag(Flag.C, c); break  // RR
        case 4: c = (v & 0x80) !== 0; v = (v << 1) & 0xff
                this.setFlag(Flag.C, c); break  // SLA
        case 5: c = (v & 0x01) !== 0; v = ((v >> 1) | (v & 0x80)) & 0xff
                this.setFlag(Flag.C, c); break  // SRA
        case 6: c = (v & 0x80) !== 0; v = ((v << 1) | 1) & 0xff
                this.setFlag(Flag.C, c); break  // SLL (undocumented)
        case 7: c = (v & 0x01) !== 0; v = (v >> 1) & 0xff
                this.setFlag(Flag.C, c); break  // SRL
      }
      this.setFlag(Flag.N, false)
      this.setFlag(Flag.H, false)
      this.setSZF53(v)
      this.setFlag(Flag.PV, PARITY_TABLE[v] ?? false)
      this.setReg(reg, v)
    } else if (op < 0x80) {
      // BIT b, r
      const mask = 1 << bit
      this.setFlag(Flag.Z,  (v & mask) === 0)
      this.setFlag(Flag.N,  false)
      this.setFlag(Flag.H,  true)
      this.setFlag(Flag.PV, (v & mask) === 0)  // PV mirrors Z for BIT
      cycles = reg === 6 ? 12 : 8
    } else if (op < 0xc0) {
      // RES b, r
      v &= ~(1 << bit) & 0xff
      this.setReg(reg, v)
    } else {
      // SET b, r
      v |= (1 << bit) & 0xff
      this.setReg(reg, v)
    }

    return cycles
  }

  // ─────────────────────────────────────────────────────────────────
  // Main execute
  // ─────────────────────────────────────────────────────────────────

  /** Execute one instruction and return T-states consumed */
  step(): number {
    if (this.halted) return 4

    // EI delay: enable interrupts NOW (one instruction after EI executed)
    if (this.eiPending) {
      this.eiPending    = false
      this.regs.IFF1    = true
      this.regs.IFF2    = true
    }

    const op = this.fetch()

    // R register: incremented on every M1 cycle (opcode fetch).
    // Only bits 0-6 wrap; bit 7 is preserved.
    this.regs.R = (this.regs.R & 0x80) | ((this.regs.R + 1) & 0x7f)

    let cycles = 4

    switch (op) {
      // ── 0x00 – 0x0F ──────────────────────────────────────────────
      case 0x00: cycles = 4; break  // NOP
      case 0x01: this.regs.BC = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; cycles = 10; break  // LD BC,nn
      case 0x02: this.wb(this.regs.BC, this.regs.A); cycles = 7; break  // LD (BC),A
      case 0x03: this.regs.BC = (this.regs.BC + 1) & 0xffff; cycles = 6; break  // INC BC
      case 0x04: this.regs.B = this.aluInc(this.regs.B); cycles = 4; break  // INC B
      case 0x05: this.regs.B = this.aluDec(this.regs.B); cycles = 4; break  // DEC B
      case 0x06: this.regs.B = this.fetch(); cycles = 7; break  // LD B,n
      case 0x07: this.rlca(); cycles = 4; break  // RLCA
      case 0x08: this.regs.exAF(); cycles = 4; break  // EX AF,AF'
      case 0x09: this.addHL(this.regs.BC); cycles = 11; break  // ADD HL,BC
      case 0x0a: this.regs.A = this.rb(this.regs.BC); cycles = 7; break  // LD A,(BC)
      case 0x0b: this.regs.BC = (this.regs.BC - 1) & 0xffff; cycles = 6; break  // DEC BC
      case 0x0c: this.regs.C = this.aluInc(this.regs.C); cycles = 4; break  // INC C
      case 0x0d: this.regs.C = this.aluDec(this.regs.C); cycles = 4; break  // DEC C
      case 0x0e: this.regs.C = this.fetch(); cycles = 7; break  // LD C,n
      case 0x0f: this.rrca(); cycles = 4; break  // RRCA

      // ── 0x10 – 0x1F ──────────────────────────────────────────────
      case 0x10: {  // DJNZ e
        const e = this.fetchSigned()
        this.regs.B = (this.regs.B - 1) & 0xff
        if (this.regs.B !== 0) { this.regs.PC = (this.regs.PC + e) & 0xffff; cycles = 13 }
        else cycles = 8
        break
      }
      case 0x11: this.regs.DE = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; cycles = 10; break  // LD DE,nn
      case 0x12: this.wb(this.regs.DE, this.regs.A); cycles = 7; break  // LD (DE),A
      case 0x13: this.regs.DE = (this.regs.DE + 1) & 0xffff; cycles = 6; break  // INC DE
      case 0x14: this.regs.D = this.aluInc(this.regs.D); cycles = 4; break  // INC D
      case 0x15: this.regs.D = this.aluDec(this.regs.D); cycles = 4; break  // DEC D
      case 0x16: this.regs.D = this.fetch(); cycles = 7; break  // LD D,n
      case 0x17: this.rla(); cycles = 4; break  // RLA
      case 0x18: { const e = this.fetchSigned(); this.regs.PC = (this.regs.PC + e) & 0xffff; cycles = 12; break }  // JR e
      case 0x19: this.addHL(this.regs.DE); cycles = 11; break  // ADD HL,DE
      case 0x1a: this.regs.A = this.rb(this.regs.DE); cycles = 7; break  // LD A,(DE)
      case 0x1b: this.regs.DE = (this.regs.DE - 1) & 0xffff; cycles = 6; break  // DEC DE
      case 0x1c: this.regs.E = this.aluInc(this.regs.E); cycles = 4; break  // INC E
      case 0x1d: this.regs.E = this.aluDec(this.regs.E); cycles = 4; break  // DEC E
      case 0x1e: this.regs.E = this.fetch(); cycles = 7; break  // LD E,n
      case 0x1f: this.rra(); cycles = 4; break  // RRA

      // ── 0x20 – 0x2F ──────────────────────────────────────────────
      case 0x20: {  // JR NZ,e
        const e = this.fetchSigned()
        if (!this.getFlag(Flag.Z)) { this.regs.PC = (this.regs.PC + e) & 0xffff; cycles = 12 }
        else cycles = 7
        break
      }
      case 0x21: this.regs.HL = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; cycles = 10; break  // LD HL,nn
      case 0x22: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; this.ww(nn, this.regs.HL); cycles = 16; break }  // LD (nn),HL
      case 0x23: this.regs.HL = (this.regs.HL + 1) & 0xffff; cycles = 6; break  // INC HL
      case 0x24: this.regs.H = this.aluInc(this.regs.H); cycles = 4; break  // INC H
      case 0x25: this.regs.H = this.aluDec(this.regs.H); cycles = 4; break  // DEC H
      case 0x26: this.regs.H = this.fetch(); cycles = 7; break  // LD H,n
      case 0x27: this.daa(); cycles = 4; break  // DAA
      case 0x28: {  // JR Z,e
        const e = this.fetchSigned()
        if (this.getFlag(Flag.Z)) { this.regs.PC = (this.regs.PC + e) & 0xffff; cycles = 12 }
        else cycles = 7
        break
      }
      case 0x29: this.addHL(this.regs.HL); cycles = 11; break  // ADD HL,HL
      case 0x2a: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; this.regs.HL = this.rw(nn); cycles = 16; break }  // LD HL,(nn)
      case 0x2b: this.regs.HL = (this.regs.HL - 1) & 0xffff; cycles = 6; break  // DEC HL
      case 0x2c: this.regs.L = this.aluInc(this.regs.L); cycles = 4; break  // INC L
      case 0x2d: this.regs.L = this.aluDec(this.regs.L); cycles = 4; break  // DEC L
      case 0x2e: this.regs.L = this.fetch(); cycles = 7; break  // LD L,n
      case 0x2f: this.regs.A ^= 0xff; this.setFlag(Flag.N, true); this.setFlag(Flag.H, true); cycles = 4; break  // CPL

      // ── 0x30 – 0x3F ──────────────────────────────────────────────
      case 0x30: {  // JR NC,e
        const e = this.fetchSigned()
        if (!this.getFlag(Flag.C)) { this.regs.PC = (this.regs.PC + e) & 0xffff; cycles = 12 }
        else cycles = 7
        break
      }
      case 0x31: this.regs.SP = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; cycles = 10; break  // LD SP,nn
      case 0x32: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; this.wb(nn, this.regs.A); cycles = 13; break }  // LD (nn),A
      case 0x33: this.regs.SP = (this.regs.SP + 1) & 0xffff; cycles = 6; break  // INC SP
      case 0x34: this.wb(this.regs.HL, this.aluInc(this.rb(this.regs.HL))); cycles = 11; break  // INC (HL)
      case 0x35: this.wb(this.regs.HL, this.aluDec(this.rb(this.regs.HL))); cycles = 11; break  // DEC (HL)
      case 0x36: this.wb(this.regs.HL, this.fetch()); cycles = 10; break  // LD (HL),n
      case 0x37: this.setFlag(Flag.C, true); this.setFlag(Flag.N, false); this.setFlag(Flag.H, false); cycles = 4; break  // SCF
      case 0x38: {  // JR C,e
        const e = this.fetchSigned()
        if (this.getFlag(Flag.C)) { this.regs.PC = (this.regs.PC + e) & 0xffff; cycles = 12 }
        else cycles = 7
        break
      }
      case 0x39: this.addHL(this.regs.SP); cycles = 11; break  // ADD HL,SP
      case 0x3a: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; this.regs.A = this.rb(nn); cycles = 13; break }  // LD A,(nn)
      case 0x3b: this.regs.SP = (this.regs.SP - 1) & 0xffff; cycles = 6; break  // DEC SP
      case 0x3c: this.regs.A = this.aluInc(this.regs.A); cycles = 4; break  // INC A
      case 0x3d: this.regs.A = this.aluDec(this.regs.A); cycles = 4; break  // DEC A
      case 0x3e: this.regs.A = this.fetch(); cycles = 7; break  // LD A,n
      case 0x3f: {  // CCF
        this.setFlag(Flag.H, this.getFlag(Flag.C))
        this.setFlag(Flag.C, !this.getFlag(Flag.C))
        this.setFlag(Flag.N, false)
        cycles = 4; break
      }

      // ── 0x40 – 0x7F: LD r,r' and HALT ───────────────────────────
      case 0x76: this.halted = true; cycles = 4; break  // HALT
      default:
        if (op >= 0x40 && op <= 0x7f) {
          // LD r, r'
          const dst = (op >> 3) & 0x07
          const src = op & 0x07
          const v = this.getReg(src)
          this.setReg(dst, v)
          cycles = (dst === 6 || src === 6) ? 7 : 4
        }
        // ── 0x80 – 0xBF: ALU on registers ───────────────────────────
        else if (op >= 0x80 && op <= 0xbf) {
          const alu = (op >> 3) & 0x07
          const src = op & 0x07
          const v = this.getReg(src)
          cycles = src === 6 ? 7 : 4
          this.executeALU(alu, v)
        }
        // ── 0xC0 – 0xFF ──────────────────────────────────────────────
        else {
          cycles = this.executeUpper(op)
        }
    }

    this.tStates += cycles
    return cycles
  }

  private executeALU(alu: number, v: number): void {
    switch (alu) {
      case 0: this.aluAdd(v); break         // ADD A,r
      case 1: this.aluAdd(v, true); break   // ADC A,r
      case 2: this.aluSub(v); break         // SUB r
      case 3: this.aluSub(v, true); break   // SBC A,r
      case 4: this.aluAnd(v); break         // AND r
      case 5: this.aluXor(v); break         // XOR r
      case 6: this.aluOr(v); break          // OR r
      case 7: this.aluSub(v, false, false); break  // CP r
    }
  }

  private executeUpper(op: number): number {
    let cycles = 4

    switch (op) {
      // RET cc
      case 0xc0: if (!this.getFlag(Flag.Z))  { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break
      case 0xc8: if ( this.getFlag(Flag.Z))  { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break
      case 0xd0: if (!this.getFlag(Flag.C))  { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break
      case 0xd8: if ( this.getFlag(Flag.C))  { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break
      case 0xe0: if (!this.getFlag(Flag.PV)) { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break
      case 0xe8: if ( this.getFlag(Flag.PV)) { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break
      case 0xf0: if (!this.getFlag(Flag.S))  { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break
      case 0xf8: if ( this.getFlag(Flag.S))  { this.regs.PC = this.pop(); cycles = 11 } else cycles = 5; break

      // POP rr
      case 0xc1: this.regs.BC = this.pop(); cycles = 10; break
      case 0xd1: this.regs.DE = this.pop(); cycles = 10; break
      case 0xe1: this.regs.HL = this.pop(); cycles = 10; break
      case 0xf1: this.regs.AF = this.pop(); cycles = 10; break

      // JP cc, nn
      case 0xc2: case 0xca: case 0xd2: case 0xda:
      case 0xe2: case 0xea: case 0xf2: case 0xfa: {
        const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff
        if (this.condition((op >> 3) & 0x07)) this.regs.PC = nn
        cycles = 10; break
      }

      // JP nn
      case 0xc3: this.regs.PC = this.rw(this.regs.PC); cycles = 10; break

      // CB prefix
      case 0xcb: cycles = this.executeCB(); break

      // ED prefix
      case 0xed: cycles = this.executeED(); break

      // DD prefix (IX)
      case 0xdd: cycles = this.executeXY(true); break

      // FD prefix (IY)
      case 0xfd: cycles = this.executeXY(false); break

      // CALL cc, nn
      case 0xc4: case 0xcc: case 0xd4: case 0xdc:
      case 0xe4: case 0xec: case 0xf4: case 0xfc: {
        const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff
        if (this.condition((op >> 3) & 0x07)) { this.push(this.regs.PC); this.regs.PC = nn; cycles = 17 }
        else cycles = 10
        break
      }

      // PUSH rr
      case 0xc5: this.push(this.regs.BC); cycles = 11; break
      case 0xd5: this.push(this.regs.DE); cycles = 11; break
      case 0xe5: this.push(this.regs.HL); cycles = 11; break
      case 0xf5: this.push(this.regs.AF); cycles = 11; break

      // ALU A, n  (immediate)
      case 0xc6: this.aluAdd(this.fetch()); cycles = 7; break          // ADD A,n
      case 0xce: this.aluAdd(this.fetch(), true); cycles = 7; break    // ADC A,n
      case 0xd6: this.aluSub(this.fetch()); cycles = 7; break          // SUB n
      case 0xde: this.aluSub(this.fetch(), true); cycles = 7; break    // SBC A,n
      case 0xe6: this.aluAnd(this.fetch()); cycles = 7; break          // AND n
      case 0xee: this.aluXor(this.fetch()); cycles = 7; break          // XOR n
      case 0xf6: this.aluOr(this.fetch()); cycles = 7; break           // OR n
      case 0xfe: this.aluSub(this.fetch(), false, false); cycles = 7; break  // CP n

      // RST p
      case 0xc7: case 0xcf: case 0xd7: case 0xdf:
      case 0xe7: case 0xef: case 0xf7: case 0xff:
        this.push(this.regs.PC); this.regs.PC = op & 0x38; cycles = 11; break

      // RET
      case 0xc9: this.regs.PC = this.pop(); cycles = 10; break

      // CALL nn
      case 0xcd: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC + 2) & 0xffff; this.push(this.regs.PC); this.regs.PC = nn; cycles = 17; break }

      // EX (SP),HL
      case 0xe3: {
        const tmp = this.rw(this.regs.SP)
        this.ww(this.regs.SP, this.regs.HL)
        this.regs.HL = tmp
        cycles = 19; break
      }

      // EX DE,HL
      case 0xeb: { const tmp = this.regs.DE; this.regs.DE = this.regs.HL; this.regs.HL = tmp; cycles = 4; break }

      // JP (HL)
      case 0xe9: this.regs.PC = this.regs.HL; cycles = 4; break

      // LD SP,HL
      case 0xf9: this.regs.SP = this.regs.HL; cycles = 6; break

      // DI / EI
      case 0xf3: this.regs.IFF1 = false; this.regs.IFF2 = false; this.eiPending = false; cycles = 4; break
      case 0xfb: this.eiPending = true; cycles = 4; break  // EI — delay one instruction

      // EXX
      case 0xd9: this.regs.exx(); cycles = 4; break

      // OUT (n),A  /  IN A,(n)
      // OUT (n),A  — full port = (A << 8) | n
      case 0xd3: {
        const portN = this.fetch()
        this.io.write((this.regs.A << 8) | portN, this.regs.A)
        cycles = 11; break
      }
      // IN A,(n)  — full port = (A << 8) | n
      case 0xdb: {
        const portN = this.fetch()
        this.regs.A = this.io.read((this.regs.A << 8) | portN) & 0xff
        cycles = 11; break
      }

      default:
        // Unimplemented opcode — treat as NOP for now
        cycles = 4
    }

    return cycles
  }

  // ─────────────────────────────────────────────────────────────────
  // DAA  (Decimal Adjust Accumulator)
  // ─────────────────────────────────────────────────────────────────
  private daa(): void {
    let a = this.regs.A
    const n = this.getFlag(Flag.N)
    const c = this.getFlag(Flag.C)
    const h = this.getFlag(Flag.H)

    let correction = 0
    if (h || (!n && (a & 0xf) > 9)) correction |= 0x06
    if (c || (!n && a > 0x99)) { correction |= 0x60; this.setFlag(Flag.C, true) }

    a = n ? (a - correction) & 0xff : (a + correction) & 0xff

    this.regs.A = a
    this.setSZF53(a)
    this.setFlag(Flag.H, false)
    this.setFlag(Flag.PV, PARITY_TABLE[a] ?? false)
  }

  // ─────────────────────────────────────────────────────────────────
  // NMI / maskable interrupt
  // ─────────────────────────────────────────────────────────────────

  /** Trigger a Non-Maskable Interrupt */
  nmi(): void {
    this.regs.IFF2 = this.regs.IFF1
    this.regs.IFF1 = false
    this.halted = false
    this.push(this.regs.PC)
    this.regs.PC = 0x0066
    this.tStates += 11
  }

  /**
   * Trigger a Maskable Interrupt (INT).
   * The ZX Spectrum ULA pulses /INT 50 times a second (once per frame).
   * Only has effect if IFF1 is enabled (interrupts not disabled via DI).
   *
   * dataBusValue is only relevant for IM 2 (used to form the vector
   * address). The Spectrum's ULA always puts 0xFF on the data bus,
   * which combined with the I register gives the IM2 vector table
   * entry — this is how games install custom interrupt routines.
   *
   * Returns the number of T-states consumed (0 if interrupt was masked).
   */
  interrupt(dataBusValue = 0xff): number {
    if (!this.regs.IFF1) return 0

    this.halted = false
    this.regs.IFF1 = false
    this.regs.IFF2 = false

    switch (this.regs.IM) {
      case 0:
        // IM 0: execute instruction on data bus — in practice always RST 38h
        this.push(this.regs.PC)
        this.regs.PC = 0x0038
        this.tStates += 13
        return 13

      case 1:
        // IM 1: always RST 38h
        this.push(this.regs.PC)
        this.regs.PC = 0x0038
        this.tStates += 13
        return 13

      case 2: {
        // IM 2: vector = (I << 8) | dataBusValue, then jump to address stored there
        const vectorAddr = ((this.regs.I << 8) | (dataBusValue & 0xff)) & 0xffff
        this.push(this.regs.PC)
        this.regs.PC = this.rw(vectorAddr)
        this.tStates += 19
        return 19
      }

      default:
        return 0
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // ED-prefix: extended instructions
  // Covers: 16-bit loads, block transfers, I/O block, ADC/SBC HL,rr
  // ─────────────────────────────────────────────────────────────────
  private executeED(): number {
    const op = this.fetch()
    this.regs.R = (this.regs.R & 0x80) | ((this.regs.R + 1) & 0x7f)
    let cycles = 8

    switch (op) {
      // ── SBC HL, rr  (0x42, 0x52, 0x62, 0x72) ─────────────────────
      case 0x42: this.sbcHL(this.regs.BC); cycles = 15; break
      case 0x52: this.sbcHL(this.regs.DE); cycles = 15; break
      case 0x62: this.sbcHL(this.regs.HL); cycles = 15; break
      case 0x72: this.sbcHL(this.regs.SP); cycles = 15; break

      // ── ADC HL, rr  (0x4A, 0x5A, 0x6A, 0x7A) ─────────────────────
      case 0x4a: this.adcHL(this.regs.BC); cycles = 15; break
      case 0x5a: this.adcHL(this.regs.DE); cycles = 15; break
      case 0x6a: this.adcHL(this.regs.HL); cycles = 15; break
      case 0x7a: this.adcHL(this.regs.SP); cycles = 15; break

      // ── LD (nn), rr / LD rr, (nn) ─────────────────────────────────
      case 0x43: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.ww(nn, this.regs.BC); cycles = 20; break }
      case 0x53: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.ww(nn, this.regs.DE); cycles = 20; break }
      case 0x63: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.ww(nn, this.regs.HL); cycles = 20; break }
      case 0x73: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.ww(nn, this.regs.SP); cycles = 20; break }

      case 0x4b: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.regs.BC = this.rw(nn); cycles = 20; break }
      case 0x5b: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.regs.DE = this.rw(nn); cycles = 20; break }
      case 0x6b: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.regs.HL = this.rw(nn); cycles = 20; break }
      case 0x7b: { const nn = this.rw(this.regs.PC); this.regs.PC = (this.regs.PC+2)&0xffff; this.regs.SP = this.rw(nn); cycles = 20; break }

      // ── LD A, I/R  /  LD I/R, A ───────────────────────────────────
      case 0x47: this.regs.I = this.regs.A; cycles = 9; break
      case 0x4f: this.regs.R = this.regs.A; cycles = 9; break
      case 0x57: {
        this.regs.A = this.regs.I
        this.setSZF53(this.regs.A)
        this.setFlag(Flag.H,  false)
        this.setFlag(Flag.N,  false)
        this.setFlag(Flag.PV, this.regs.IFF2)
        cycles = 9; break
      }
      case 0x5f: {
        this.regs.A = this.regs.R
        this.setSZF53(this.regs.A)
        this.setFlag(Flag.H,  false)
        this.setFlag(Flag.N,  false)
        this.setFlag(Flag.PV, this.regs.IFF2)
        cycles = 9; break
      }

      // ── Interrupt mode ─────────────────────────────────────────────
      case 0x46: case 0x66: this.regs.IM = 0; cycles = 8; break
      case 0x56: case 0x76: this.regs.IM = 1; cycles = 8; break
      case 0x5e: case 0x7e: this.regs.IM = 2; cycles = 8; break

      // ── RETN / RETI ───────────────────────────────────────────────
      case 0x45: case 0x55: case 0x65: case 0x75:  // RETN
      case 0x4d: case 0x5d: case 0x6d: case 0x7d:  // RETI
        this.regs.IFF1 = this.regs.IFF2
        this.regs.PC = this.pop()
        cycles = 14; break

      // ── NEG ───────────────────────────────────────────────────────
      case 0x44: case 0x4c: case 0x54: case 0x5c:
      case 0x64: case 0x6c: case 0x74: case 0x7c: {
        const a = this.regs.A
        this.regs.A = 0
        this.aluSub(a)
        cycles = 8; break
      }

      // ── IN r, (C)  — read port BC, store in register r ────────────
      case 0x40: this.regs.B = this.inC(); cycles = 12; break
      case 0x48: this.regs.C = this.inC(); cycles = 12; break
      case 0x50: this.regs.D = this.inC(); cycles = 12; break
      case 0x58: this.regs.E = this.inC(); cycles = 12; break
      case 0x60: this.regs.H = this.inC(); cycles = 12; break
      case 0x68: this.regs.L = this.inC(); cycles = 12; break
      case 0x70: this.inC(); cycles = 12; break  // IN F,(C) — flags only
      case 0x78: this.regs.A = this.inC(); cycles = 12; break

      // ── OUT (C), r ────────────────────────────────────────────────
      case 0x41: this.io.write(this.regs.BC, this.regs.B); cycles = 12; break
      case 0x49: this.io.write(this.regs.BC, this.regs.C); cycles = 12; break
      case 0x51: this.io.write(this.regs.BC, this.regs.D); cycles = 12; break
      case 0x59: this.io.write(this.regs.BC, this.regs.E); cycles = 12; break
      case 0x61: this.io.write(this.regs.BC, this.regs.H); cycles = 12; break
      case 0x69: this.io.write(this.regs.BC, this.regs.L); cycles = 12; break
      case 0x71: this.io.write(this.regs.BC, 0); cycles = 12; break
      case 0x79: this.io.write(this.regs.BC, this.regs.A); cycles = 12; break

      // ── Block transfer: LDI, LDD, LDIR, LDDR ─────────────────────
      case 0xa0: this.ldi(); cycles = 16; break   // LDI
      case 0xa8: this.ldd(); cycles = 16; break   // LDD
      case 0xb0: cycles = this.ldir(); break       // LDIR
      case 0xb8: cycles = this.lddr(); break       // LDDR

      // ── Block compare: CPI, CPD, CPIR, CPDR ──────────────────────
      case 0xa1: this.cpi(); cycles = 16; break
      case 0xa9: this.cpd(); cycles = 16; break
      case 0xb1: cycles = this.cpir(); break
      case 0xb9: cycles = this.cpdr(); break

      // ── Block I/O: INI, IND, INIR, INDR ──────────────────────────
      case 0xa2: this.ini(); cycles = 16; break
      case 0xaa: this.ind(); cycles = 16; break
      case 0xb2: cycles = this.inir(); break
      case 0xba: cycles = this.indr(); break

      // ── Block output: OUTI, OUTD, OTIR, OTDR ─────────────────────
      case 0xa3: this.outi(); cycles = 16; break
      case 0xab: this.outd(); cycles = 16; break
      case 0xb3: cycles = this.otir(); break
      case 0xbb: cycles = this.otdr(); break

      // ── RLD / RRD ─────────────────────────────────────────────────
      case 0x6f: this.rld(); cycles = 18; break
      case 0x67: this.rrd(); cycles = 18; break

      default:
        cycles = 8  // NOP for unimplemented ED opcodes
    }

    return cycles
  }

  // ── ED helpers ────────────────────────────────────────────────────

  private inC(): number {
    const v = this.io.read(this.regs.BC) & 0xff
    this.setSZF53(v)
    this.setFlag(Flag.H,  false)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.PV, PARITY_TABLE[v] ?? false)
    return v
  }

  private sbcHL(rr: number): void {
    const hl  = this.regs.HL
    const c   = this.getFlag(Flag.C) ? 1 : 0
    const res = hl - rr - c
    this.regs.HL = res & 0xffff
    this.setFlag(Flag.S,  (res & 0x8000) !== 0)
    this.setFlag(Flag.Z,  (res & 0xffff) === 0)
    this.setFlag(Flag.H,  ((hl & 0xfff) - (rr & 0xfff) - c) < 0)
    this.setFlag(Flag.PV, ((hl ^ rr) & (hl ^ res) & 0x8000) !== 0)
    this.setFlag(Flag.N,  true)
    this.setFlag(Flag.C,  res < 0)
    this.setFlag(Flag.F5, (this.regs.H & 0x20) !== 0)
    this.setFlag(Flag.F3, (this.regs.H & 0x08) !== 0)
  }

  private adcHL(rr: number): void {
    const hl  = this.regs.HL
    const c   = this.getFlag(Flag.C) ? 1 : 0
    const res = hl + rr + c
    this.regs.HL = res & 0xffff
    this.setFlag(Flag.S,  (res & 0x8000) !== 0)
    this.setFlag(Flag.Z,  (res & 0xffff) === 0)
    this.setFlag(Flag.H,  ((hl & 0xfff) + (rr & 0xfff) + c) > 0xfff)
    this.setFlag(Flag.PV, (~(hl ^ rr) & (hl ^ res) & 0x8000) !== 0)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.C,  res > 0xffff)
    this.setFlag(Flag.F5, (this.regs.H & 0x20) !== 0)
    this.setFlag(Flag.F3, (this.regs.H & 0x08) !== 0)
  }

  // LDI: (DE) ← (HL), HL++, DE++, BC--
  private ldi(): void {
    const v = this.rb(this.regs.HL)
    this.wb(this.regs.DE, v)
    this.regs.HL = (this.regs.HL + 1) & 0xffff
    this.regs.DE = (this.regs.DE + 1) & 0xffff
    this.regs.BC = (this.regs.BC - 1) & 0xffff
    this.setFlag(Flag.H,  false)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.PV, this.regs.BC !== 0)
    const n = (v + this.regs.A) & 0xff
    this.setFlag(Flag.F3, (n & 0x08) !== 0)
    this.setFlag(Flag.F5, (n & 0x02) !== 0)
  }

  // LDD: (DE) ← (HL), HL--, DE--, BC--
  private ldd(): void {
    const v = this.rb(this.regs.HL)
    this.wb(this.regs.DE, v)
    this.regs.HL = (this.regs.HL - 1) & 0xffff
    this.regs.DE = (this.regs.DE - 1) & 0xffff
    this.regs.BC = (this.regs.BC - 1) & 0xffff
    this.setFlag(Flag.H,  false)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.PV, this.regs.BC !== 0)
    const n = (v + this.regs.A) & 0xff
    this.setFlag(Flag.F3, (n & 0x08) !== 0)
    this.setFlag(Flag.F5, (n & 0x02) !== 0)
  }

  // LDIR: repeat LDI while BC≠0
  private ldir(): number {
    this.ldi()
    if (this.regs.BC !== 0) {
      this.regs.PC = (this.regs.PC - 2) & 0xffff  // repeat
      return 21
    }
    return 16
  }

  // LDDR: repeat LDD while BC≠0
  private lddr(): number {
    this.ldd()
    if (this.regs.BC !== 0) {
      this.regs.PC = (this.regs.PC - 2) & 0xffff
      return 21
    }
    return 16
  }

  // CPI: compare A with (HL), HL++, BC--
  private cpi(): void {
    const v = this.rb(this.regs.HL)
    const r = (this.regs.A - v) & 0xff
    this.regs.HL = (this.regs.HL + 1) & 0xffff
    this.regs.BC = (this.regs.BC - 1) & 0xffff
    this.setFlag(Flag.S,  (r & 0x80) !== 0)
    this.setFlag(Flag.Z,  r === 0)
    this.setFlag(Flag.H,  (this.regs.A & 0xf) < (v & 0xf))
    this.setFlag(Flag.PV, this.regs.BC !== 0)
    this.setFlag(Flag.N,  true)
    const n = r - (this.getFlag(Flag.H) ? 1 : 0)
    this.setFlag(Flag.F3, (n & 0x08) !== 0)
    this.setFlag(Flag.F5, (n & 0x02) !== 0)
  }

  // CPD: compare A with (HL), HL--, BC--
  private cpd(): void {
    const v = this.rb(this.regs.HL)
    const r = (this.regs.A - v) & 0xff
    this.regs.HL = (this.regs.HL - 1) & 0xffff
    this.regs.BC = (this.regs.BC - 1) & 0xffff
    this.setFlag(Flag.S,  (r & 0x80) !== 0)
    this.setFlag(Flag.Z,  r === 0)
    this.setFlag(Flag.H,  (this.regs.A & 0xf) < (v & 0xf))
    this.setFlag(Flag.PV, this.regs.BC !== 0)
    this.setFlag(Flag.N,  true)
    const n = r - (this.getFlag(Flag.H) ? 1 : 0)
    this.setFlag(Flag.F3, (n & 0x08) !== 0)
    this.setFlag(Flag.F5, (n & 0x02) !== 0)
  }

  private cpir(): number {
    this.cpi()
    if (this.regs.BC !== 0 && !this.getFlag(Flag.Z)) {
      this.regs.PC = (this.regs.PC - 2) & 0xffff
      return 21
    }
    return 16
  }

  private cpdr(): number {
    this.cpd()
    if (this.regs.BC !== 0 && !this.getFlag(Flag.Z)) {
      this.regs.PC = (this.regs.PC - 2) & 0xffff
      return 21
    }
    return 16
  }

  // INI: (HL) ← IN(BC), HL++, B--
  private ini(): void {
    const v = this.io.read(this.regs.BC) & 0xff
    this.wb(this.regs.HL, v)
    this.regs.HL = (this.regs.HL + 1) & 0xffff
    this.regs.B  = (this.regs.B  - 1) & 0xff
    this.setFlag(Flag.Z, this.regs.B === 0)
    this.setFlag(Flag.N, true)
  }

  // IND: (HL) ← IN(BC), HL--, B--
  private ind(): void {
    const v = this.io.read(this.regs.BC) & 0xff
    this.wb(this.regs.HL, v)
    this.regs.HL = (this.regs.HL - 1) & 0xffff
    this.regs.B  = (this.regs.B  - 1) & 0xff
    this.setFlag(Flag.Z, this.regs.B === 0)
    this.setFlag(Flag.N, true)
  }

  private inir(): number {
    this.ini()
    if (this.regs.B !== 0) { this.regs.PC = (this.regs.PC - 2) & 0xffff; return 21 }
    return 16
  }

  private indr(): number {
    this.ind()
    if (this.regs.B !== 0) { this.regs.PC = (this.regs.PC - 2) & 0xffff; return 21 }
    return 16
  }

  // OUTI: OUT(BC) ← (HL), HL++, B--
  private outi(): void {
    const v = this.rb(this.regs.HL)
    this.regs.HL = (this.regs.HL + 1) & 0xffff
    this.regs.B  = (this.regs.B  - 1) & 0xff
    this.io.write(this.regs.BC, v)
    this.setFlag(Flag.Z, this.regs.B === 0)
    this.setFlag(Flag.N, true)
  }

  // OUTD: OUT(BC) ← (HL), HL--, B--
  private outd(): void {
    const v = this.rb(this.regs.HL)
    this.regs.HL = (this.regs.HL - 1) & 0xffff
    this.regs.B  = (this.regs.B  - 1) & 0xff
    this.io.write(this.regs.BC, v)
    this.setFlag(Flag.Z, this.regs.B === 0)
    this.setFlag(Flag.N, true)
  }

  private otir(): number {
    this.outi()
    if (this.regs.B !== 0) { this.regs.PC = (this.regs.PC - 2) & 0xffff; return 21 }
    return 16
  }

  private otdr(): number {
    this.outd()
    if (this.regs.B !== 0) { this.regs.PC = (this.regs.PC - 2) & 0xffff; return 21 }
    return 16
  }

  // RLD: high nibble of (HL) ← low nibble of A; low nibble of A ← high nibble of (HL)
  private rld(): void {
    const m = this.rb(this.regs.HL)
    const a = this.regs.A
    this.wb(this.regs.HL, ((m << 4) | (a & 0xf)) & 0xff)
    this.regs.A = (a & 0xf0) | (m >> 4)
    this.setSZF53(this.regs.A)
    this.setFlag(Flag.H,  false)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.PV, PARITY_TABLE[this.regs.A] ?? false)
  }

  // RRD: low nibble of (HL) ← high nibble of A; high nibble of A ← low nibble of (HL)
  private rrd(): void {
    const m = this.rb(this.regs.HL)
    const a = this.regs.A
    this.wb(this.regs.HL, ((a << 4) | (m >> 4)) & 0xff)
    this.regs.A = (a & 0xf0) | (m & 0xf)
    this.setSZF53(this.regs.A)
    this.setFlag(Flag.H,  false)
    this.setFlag(Flag.N,  false)
    this.setFlag(Flag.PV, PARITY_TABLE[this.regs.A] ?? false)
  }

  // ─────────────────────────────────────────────────────────────────
  // DD/FD prefix: IX and IY instructions
  //
  // Most DD/FD opcodes are identical to the unprefixed version but
  // substitute HL → IX (DD) or IY (FD), and add a signed 8-bit
  // displacement for (IX+d) / (IY+d) indirect accesses.
  //
  // useIX=true  → DD prefix → use IX
  // useIX=false → FD prefix → use IY
  // ─────────────────────────────────────────────────────────────────
  private executeXY(useIX: boolean): number {
    const op = this.fetch()
    this.regs.R = (this.regs.R & 0x80) | ((this.regs.R + 1) & 0x7f)

    // Helpers to read/write the active index register
    const getXY  = (): number           => useIX ? this.regs.IX : this.regs.IY
    const setXY  = (v: number): void    => { if (useIX) this.regs.IX = v & 0xffff; else this.regs.IY = v & 0xffff }
    const getXYH = (): number           => (getXY() >> 8) & 0xff
    const getXYL = (): number           => getXY() & 0xff
    const setXYH = (v: number): void    => setXY((getXY() & 0x00ff) | ((v & 0xff) << 8))
    const setXYL = (v: number): void    => setXY((getXY() & 0xff00) | (v & 0xff))

    // Read signed displacement and compute effective address
    const disp   = (): number => {
      const d = this.fetch()
      return (getXY() + (d < 0x80 ? d : d - 256)) & 0xffff
    }

    let cycles = 8

    switch (op) {
      // ── LD XY, nn ─────────────────────────────────────────────────
      case 0x21: setXY(this.rw(this.regs.PC)); this.regs.PC = (this.regs.PC+2)&0xffff; cycles=14; break

      // ── LD (nn), XY / LD XY, (nn) ────────────────────────────────
      case 0x22: { const nn=this.rw(this.regs.PC); this.regs.PC=(this.regs.PC+2)&0xffff; this.ww(nn,getXY()); cycles=20; break }
      case 0x2a: { const nn=this.rw(this.regs.PC); this.regs.PC=(this.regs.PC+2)&0xffff; setXY(this.rw(nn)); cycles=20; break }

      // ── LD SP, XY ─────────────────────────────────────────────────
      case 0xf9: this.regs.SP = getXY(); cycles=10; break

      // ── INC/DEC XY ────────────────────────────────────────────────
      case 0x23: setXY((getXY()+1)&0xffff); cycles=10; break
      case 0x2b: setXY((getXY()-1)&0xffff); cycles=10; break

      // ── INC/DEC XYH, XYL ──────────────────────────────────────────
      case 0x24: setXYH(this.aluInc(getXYH())); cycles=8; break
      case 0x2c: setXYL(this.aluInc(getXYL())); cycles=8; break
      case 0x25: setXYH(this.aluDec(getXYH())); cycles=8; break
      case 0x2d: setXYL(this.aluDec(getXYL())); cycles=8; break

      // ── LD XYH/XYL, n ─────────────────────────────────────────────
      case 0x26: setXYH(this.fetch()); cycles=11; break
      case 0x2e: setXYL(this.fetch()); cycles=11; break

      // ── LD XYH/XYL, r ─────────────────────────────────────────────
      case 0x60: setXYH(this.regs.B); cycles=8; break
      case 0x61: setXYH(this.regs.C); cycles=8; break
      case 0x62: setXYH(this.regs.D); cycles=8; break
      case 0x63: setXYH(this.regs.E); cycles=8; break
      case 0x64: setXYH(getXYH()); cycles=8; break
      case 0x65: setXYH(getXYL()); cycles=8; break
      case 0x67: setXYH(this.regs.A); cycles=8; break
      case 0x68: setXYL(this.regs.B); cycles=8; break
      case 0x69: setXYL(this.regs.C); cycles=8; break
      case 0x6a: setXYL(this.regs.D); cycles=8; break
      case 0x6b: setXYL(this.regs.E); cycles=8; break
      case 0x6c: setXYL(getXYH()); cycles=8; break
      case 0x6d: setXYL(getXYL()); cycles=8; break
      case 0x6f: setXYL(this.regs.A); cycles=8; break

      // ── LD r, XYH/XYL ─────────────────────────────────────────────
      case 0x44: this.regs.B=getXYH(); cycles=8; break
      case 0x45: this.regs.C=getXYL(); cycles=8; break  // note: swapped
      case 0x4c: this.regs.C=getXYH(); cycles=8; break
      case 0x4d: this.regs.C=getXYL(); cycles=8; break
      case 0x54: this.regs.D=getXYH(); cycles=8; break
      case 0x55: this.regs.D=getXYL(); cycles=8; break  // note: swapped
      case 0x5c: this.regs.E=getXYH(); cycles=8; break
      case 0x5d: this.regs.E=getXYL(); cycles=8; break
      case 0x7c: this.regs.A=getXYH(); cycles=8; break
      case 0x7d: this.regs.A=getXYL(); cycles=8; break

      // ── ADD HL(→XY), rr ───────────────────────────────────────────
      case 0x09: { const r=this.regs.BC; const xy=getXY(); const res=xy+r; setXY(res&0xffff); this.setFlag(Flag.C,res>0xffff); this.setFlag(Flag.N,false); this.setFlag(Flag.H,((xy&0xfff)+(r&0xfff))>0xfff); cycles=15; break }
      case 0x19: { const r=this.regs.DE; const xy=getXY(); const res=xy+r; setXY(res&0xffff); this.setFlag(Flag.C,res>0xffff); this.setFlag(Flag.N,false); this.setFlag(Flag.H,((xy&0xfff)+(r&0xfff))>0xfff); cycles=15; break }
      case 0x29: { const r=getXY();      const xy=getXY(); const res=xy+r; setXY(res&0xffff); this.setFlag(Flag.C,res>0xffff); this.setFlag(Flag.N,false); this.setFlag(Flag.H,((xy&0xfff)+(r&0xfff))>0xfff); cycles=15; break }
      case 0x39: { const r=this.regs.SP; const xy=getXY(); const res=xy+r; setXY(res&0xffff); this.setFlag(Flag.C,res>0xffff); this.setFlag(Flag.N,false); this.setFlag(Flag.H,((xy&0xfff)+(r&0xfff))>0xfff); cycles=15; break }

      // ── INC/DEC (XY+d) ────────────────────────────────────────────
      case 0x34: { const ea=disp(); this.wb(ea,this.aluInc(this.rb(ea))); cycles=23; break }
      case 0x35: { const ea=disp(); this.wb(ea,this.aluDec(this.rb(ea))); cycles=23; break }

      // ── LD (XY+d), n ──────────────────────────────────────────────
      case 0x36: { const ea=disp(); this.wb(ea,this.fetch()); cycles=19; break }

      // ── LD (XY+d), r ──────────────────────────────────────────────
      case 0x70: { const ea=disp(); this.wb(ea,this.regs.B); cycles=19; break }
      case 0x71: { const ea=disp(); this.wb(ea,this.regs.C); cycles=19; break }
      case 0x72: { const ea=disp(); this.wb(ea,this.regs.D); cycles=19; break }
      case 0x73: { const ea=disp(); this.wb(ea,this.regs.E); cycles=19; break }
      case 0x74: { const ea=disp(); this.wb(ea,this.regs.H); cycles=19; break }
      case 0x75: { const ea=disp(); this.wb(ea,this.regs.L); cycles=19; break }
      case 0x77: { const ea=disp(); this.wb(ea,this.regs.A); cycles=19; break }

      // ── LD r, (XY+d) ──────────────────────────────────────────────
      case 0x46: { this.regs.B=this.rb(disp()); cycles=19; break }
      case 0x4e: { this.regs.C=this.rb(disp()); cycles=19; break }
      case 0x56: { this.regs.D=this.rb(disp()); cycles=19; break }
      case 0x5e: { this.regs.E=this.rb(disp()); cycles=19; break }
      case 0x66: { this.regs.H=this.rb(disp()); cycles=19; break }
      case 0x6e: { this.regs.L=this.rb(disp()); cycles=19; break }
      case 0x7e: { this.regs.A=this.rb(disp()); cycles=19; break }

      // ── ALU A, (XY+d) ─────────────────────────────────────────────
      case 0x86: { this.aluAdd(this.rb(disp()));          cycles=19; break }
      case 0x8e: { this.aluAdd(this.rb(disp()),true);     cycles=19; break }
      case 0x96: { this.aluSub(this.rb(disp()));          cycles=19; break }
      case 0x9e: { this.aluSub(this.rb(disp()),true);     cycles=19; break }
      case 0xa6: { this.aluAnd(this.rb(disp()));          cycles=19; break }
      case 0xae: { this.aluXor(this.rb(disp()));          cycles=19; break }
      case 0xb6: { this.aluOr(this.rb(disp()));           cycles=19; break }
      case 0xbe: { this.aluSub(this.rb(disp()),false,false); cycles=19; break }

      // ── ALU A, XYH/XYL ────────────────────────────────────────────
      case 0x84: { this.aluAdd(getXYH());           cycles=8; break }
      case 0x85: { this.aluAdd(getXYL());           cycles=8; break }
      case 0x8c: { this.aluAdd(getXYH(),true);      cycles=8; break }
      case 0x8d: { this.aluAdd(getXYL(),true);      cycles=8; break }
      case 0x94: { this.aluSub(getXYH());           cycles=8; break }
      case 0x95: { this.aluSub(getXYL());           cycles=8; break }
      case 0x9c: { this.aluSub(getXYH(),true);      cycles=8; break }
      case 0x9d: { this.aluSub(getXYL(),true);      cycles=8; break }
      case 0xa4: { this.aluAnd(getXYH());           cycles=8; break }
      case 0xa5: { this.aluAnd(getXYL());           cycles=8; break }
      case 0xac: { this.aluXor(getXYH());           cycles=8; break }
      case 0xad: { this.aluXor(getXYL());           cycles=8; break }
      case 0xb4: { this.aluOr(getXYH());            cycles=8; break }
      case 0xb5: { this.aluOr(getXYL());            cycles=8; break }
      case 0xbc: { this.aluSub(getXYH(),false,false); cycles=8; break }
      case 0xbd: { this.aluSub(getXYL(),false,false); cycles=8; break }

      // ── PUSH/POP XY ───────────────────────────────────────────────
      case 0xe5: { this.push(getXY()); cycles=15; break }
      case 0xe1: { setXY(this.pop()); cycles=14; break }

      // ── EX (SP), XY ───────────────────────────────────────────────
      case 0xe3: { const tmp=this.rw(this.regs.SP); this.ww(this.regs.SP,getXY()); setXY(tmp); cycles=23; break }

      // ── JP (XY) ───────────────────────────────────────────────────
      case 0xe9: { this.regs.PC=getXY(); cycles=8; break }

      // ── DDCB / FDCB: bit ops on (XY+d) ───────────────────────────
      case 0xcb: { cycles = this.executeXYCB(useIX); break }

      default:
        // Unknown DD/FD opcode — treat prefix as NOP, re-execute op
        // (This matches real Z80 behaviour for some undefined opcodes)
        cycles = 4
    }

    return cycles
  }

  // ── DDCB / FDCB: bit operations on (IX+d) / (IY+d) ──────────────
  private executeXYCB(useIX: boolean): number {
    const d   = this.fetch()
    const disp = (useIX ? this.regs.IX : this.regs.IY) + (d < 0x80 ? d : d - 256)
    const ea  = disp & 0xffff
    const op  = this.fetch()  // actual opcode after displacement

    let v = this.rb(ea)
    const bit = (op >> 3) & 0x07

    if (op < 0x40) {
      // Rotates / shifts on (XY+d)
      let c: boolean
      switch ((op >> 3) & 0x07) {
        case 0: c=(v&0x80)!==0; v=((v<<1)|(c?1:0))&0xff; this.setFlag(Flag.C,c); break  // RLC
        case 1: c=(v&0x01)!==0; v=((v>>1)|(c?0x80:0))&0xff; this.setFlag(Flag.C,c); break  // RRC
        case 2: c=(v&0x80)!==0; v=((v<<1)|(this.getFlag(Flag.C)?1:0))&0xff; this.setFlag(Flag.C,c); break  // RL
        case 3: c=(v&0x01)!==0; v=((v>>1)|(this.getFlag(Flag.C)?0x80:0))&0xff; this.setFlag(Flag.C,c); break  // RR
        case 4: c=(v&0x80)!==0; v=(v<<1)&0xff; this.setFlag(Flag.C,c); break  // SLA
        case 5: c=(v&0x01)!==0; v=((v>>1)|(v&0x80))&0xff; this.setFlag(Flag.C,c); break  // SRA
        case 6: c=(v&0x80)!==0; v=((v<<1)|1)&0xff; this.setFlag(Flag.C,c); break  // SLL
        case 7: c=(v&0x01)!==0; v=(v>>1)&0xff; this.setFlag(Flag.C,c); break  // SRL
      }
      this.setFlag(Flag.N,false); this.setFlag(Flag.H,false)
      this.setSZF53(v); this.setFlag(Flag.PV, PARITY_TABLE[v]??false)
      this.wb(ea, v)
      // Copy result to register if lower 3 bits ≠ 6
      const reg = op & 0x07
      if (reg !== 6) this.setReg(reg, v)
    } else if (op < 0x80) {
      // BIT b, (XY+d)
      this.setFlag(Flag.Z,  (v & (1<<bit))===0)
      this.setFlag(Flag.N,  false)
      this.setFlag(Flag.H,  true)
      this.setFlag(Flag.PV, (v & (1<<bit))===0)
    } else if (op < 0xc0) {
      // RES b, (XY+d)
      v &= ~(1<<bit) & 0xff
      this.wb(ea, v)
      const reg = op & 0x07
      if (reg !== 6) this.setReg(reg, v)
    } else {
      // SET b, (XY+d)
      v |= (1<<bit) & 0xff
      this.wb(ea, v)
      const reg = op & 0x07
      if (reg !== 6) this.setReg(reg, v)
    }

    return 23
  }
}
