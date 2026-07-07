/**
 * TapeLoader
 *
 * Detects TAP vs TZX by file extension and/or magic bytes,
 * parses into TapeBlocks, and returns them ready for TapePlayer.
 */
import { parseTAP }           from './TAPParser.js'
import { parseTZX }           from './TZXParser.js'
import { type TapeBlock }     from './TapeBlock.js'

export type TapeFormat = 'tap' | 'tzx' | 'unknown'

export function detectTapeFormat(filename: string, data?: Uint8Array): TapeFormat {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'tap') return 'tap'
  if (ext === 'tzx') return 'tzx'

  // Fallback: detect by magic bytes if no clear extension
  if (data && data.length >= 7) {
    const magic = String.fromCharCode(...data.slice(0, 7))
    if (magic === 'ZXTape!') return 'tzx'
  }

  return 'unknown'
}

export function loadTape(data: Uint8Array, filename: string): TapeBlock[] {
  const fmt = detectTapeFormat(filename, data)

  switch (fmt) {
    case 'tap': return parseTAP(data)
    case 'tzx': return parseTZX(data)
    default:
      throw new Error(`Unknown tape format for "${filename}". Supported: .tap, .tzx`)
  }
}
