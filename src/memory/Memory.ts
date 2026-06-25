/**
 * ZX Spectrum 48K memory map
 *
 *  0x0000 – 0x3FFF  ROM (16 KB, read-only)
 *  0x4000 – 0x57FF  Video RAM – bitmap (6144 B)
 *  0x5800 – 0x5AFF  Video RAM – attributes (768 B)
 *  0x5B00 – 0xFFFF  RAM (general purpose)
 */
export class Memory {
  private readonly data = new Uint8Array(65536)

  /** Load ROM image into the first 16 KB */
  loadROM(rom: Uint8Array): void {
    if (rom.length > 0x4000) throw new Error('ROM too large (max 16 KB)')
    this.data.set(rom, 0)
  }

  read(addr: number): number {
    return this.data[addr & 0xffff] ?? 0
  }

  write(addr: number, value: number): void {
    addr &= 0xffff
    if (addr < 0x4000) return // ROM is read-only
    this.data[addr] = value & 0xff
  }

  read16(addr: number): number {
    return this.read(addr) | (this.read(addr + 1) << 8)
  }

  write16(addr: number, value: number): void {
    this.write(addr, value & 0xff)
    this.write(addr + 1, (value >> 8) & 0xff)
  }

  /** Direct access for snapshot loading (bypasses ROM protection) */
  poke(addr: number, value: number): void {
    this.data[addr & 0xffff] = value & 0xff
  }

  /** Bulk load for snapshot restoring */
  load(offset: number, bytes: Uint8Array): void {
    this.data.set(bytes, offset & 0xffff)
  }

  getVideoRAM(): Uint8Array {
    return this.data.slice(0x4000, 0x5b00)
  }
}
