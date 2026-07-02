/**
 * SnapshotLoader
 *
 * Detects the snapshot format from the filename and dispatches to the
 * appropriate loader. Supports .z80 (v1/v2/v3) and .sna (48K).
 */

import { loadZ80 } from './Z80Snapshot.js'
import { loadSNA } from './SNASnapshot.js'
import type { SnapshotTarget } from './Z80Snapshot.js'

export type { SnapshotTarget }

export type SnapshotFormat = 'z80' | 'sna' | 'unknown'

export function detectFormat(filename: string): SnapshotFormat {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'z80') return 'z80'
  if (ext === 'sna') return 'sna'
  return 'unknown'
}

export function loadSnapshot(
  data: Uint8Array,
  filename: string,
  target: SnapshotTarget,
): void {
  const fmt = detectFormat(filename)

  switch (fmt) {
    case 'z80':
      loadZ80(data, target)
      break
    case 'sna':
      loadSNA(data, target)
      break
    default:
      throw new Error(
        `Unknown snapshot format for "${filename}". Supported: .z80, .sna`,
      )
  }
}
