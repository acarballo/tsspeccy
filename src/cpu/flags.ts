/**
 * Z80 Flag bit positions within the F register
 *
 *  Bit 7  6  5  4  3  2  1  0
 *       S  Z  F5 H  F3 PV N  C
 */
export const enum Flag {
  C  = 0x01, // Carry
  N  = 0x02, // Add/Subtract
  PV = 0x04, // Parity/Overflow
  F3 = 0x08, // Copy of bit 3 (undocumented)
  H  = 0x10, // Half Carry
  F5 = 0x20, // Copy of bit 5 (undocumented)
  Z  = 0x40, // Zero
  S  = 0x80, // Sign
}

/** Lookup table: parity of each byte value (true = even parity) */
export const PARITY_TABLE: readonly boolean[] = (() => {
  const t: boolean[] = new Array(256)
  for (let i = 0; i < 256; i++) {
    let bits = 0
    let v = i
    while (v) { bits += v & 1; v >>= 1 }
    t[i] = (bits & 1) === 0
  }
  return t
})()
