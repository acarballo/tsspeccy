/**
 * main.ts — browser entry point
 */
import { Spectrum }    from './Spectrum.js'
import { loadTape }    from './tape/TapeLoader.js'
import { DebugPanel } from './debugger/DebugPanel.js'

const canvas    = document.getElementById('screen')    as HTMLCanvasElement
const btnLoad   = document.getElementById('btn-load')   as HTMLButtonElement
const btnSnap   = document.getElementById('btn-snap')   as HTMLButtonElement
const btnStart  = document.getElementById('btn-start')  as HTMLButtonElement
const btnStop   = document.getElementById('btn-stop')   as HTMLButtonElement
const btnReset  = document.getElementById('btn-reset')  as HTMLButtonElement
const romInput  = document.getElementById('rom-input')  as HTMLInputElement
const snapInput = document.getElementById('snap-input') as HTMLInputElement
const statusEl  = document.getElementById('status')     as HTMLSpanElement
const screenWrap = document.getElementById('screen-wrap')!

const spectrum = new Spectrum(canvas)
let romLoaded = false

function setStatus(msg: string, colour = '#888'): void {
  statusEl.textContent = msg
  statusEl.style.color = colour
}

// ── ROM loading ────────────────────────────────────────────────────

async function loadROM(file: File): Promise<void> {
  try {
    const buf = await file.arrayBuffer()
    const romData = new Uint8Array(buf)
    spectrum.loadROM(romData)
    romLoaded = true
    setStatus(`ROM: ${file.name} (${buf.byteLength} bytes) — ready`, '#00d7d7')
    btnStart.disabled  = false
    btnSnap.disabled   = false
    btnReset.disabled  = false
    btnTape.disabled   = false
    btnSave.disabled   = false
    hideWelcome()
    // Persist ROM in localStorage so next visit loads automatically
    try {
      localStorage.setItem('tsspeccy_rom_name', file.name)
      localStorage.setItem('tsspeccy_rom_data', bufferToBase64(romData))
    } catch {
      // localStorage might be full or unavailable — not critical
    }
  } catch (e) {
    setStatus(`ROM error: ${e}`, '#d75f5f')
  }
}

function loadROMFromData(name: string, data: Uint8Array): void {
  spectrum.loadROM(data)
  romLoaded = true
  setStatus(`ROM: ${name} (auto-loaded) — ready`, '#00d7d7')
  btnStart.disabled  = false
  btnSnap.disabled   = false
  btnReset.disabled  = false
  btnTape.disabled   = false
  btnSave.disabled   = false
  hideWelcome()
}

// ── Base64 helpers for localStorage ───────────────────────────────

function bufferToBase64(buf: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!)
  return btoa(binary)
}

function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf
}

// ── Snapshot loading ───────────────────────────────────────────────

async function loadSnapshot(file: File): Promise<void> {
  if (!romLoaded) {
    setStatus('Load a ROM first before loading a snapshot.', '#d7af00')
    return
  }
  try {
    const buf  = await file.arrayBuffer()
    const wasRunning = spectrum.isRunning()
    spectrum.loadSnapshot(new Uint8Array(buf), file.name)
    setStatus(`Snapshot: ${file.name} loaded`, '#00d75f')
    btnStart.disabled = false
    btnStop.disabled  = false
    if (!wasRunning) {
      spectrum.start()
      btnStart.disabled = true
      btnStop.disabled  = false
    }
  } catch (e) {
    setStatus(`Snapshot error: ${e}`, '#d75f5f')
  }
}

// ── File pickers ───────────────────────────────────────────────────

btnLoad.addEventListener('click', () => romInput.click())

// Long-press or right-click Load ROM → forget saved ROM
btnLoad.addEventListener('contextmenu', e => {
  e.preventDefault()
  try {
    localStorage.removeItem('tsspeccy_rom_name')
    localStorage.removeItem('tsspeccy_rom_data')
    setStatus('Saved ROM cleared. Load a new ROM to continue.', '#d7af00')
  } catch { /* ignore */ }
})
romInput.addEventListener('change', () => {
  const f = romInput.files?.[0]; if (f) loadROM(f)
})

btnSnap.addEventListener('click', () => snapInput.click())
snapInput.addEventListener('change', () => {
  const f = snapInput.files?.[0]; if (f) loadSnapshot(f)
})

// ── Smart drag & drop — auto-detects file type ────────────────────

function dispatchFile(file: File): void {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (['rom', 'bin'].includes(ext)) {
    loadROM(file)
  } else if (['z80', 'sna'].includes(ext)) {
    loadSnapshot(file)
  } else if (['tap', 'tzx'].includes(ext)) {
    loadTapeFile(file)
  } else {
    setStatus(`Unknown file type: .${ext} — drop a .rom, .z80, .sna, .tap or .tzx`, '#d7af00')
  }
}

// Allow dropping anywhere on the page (not just the canvas)
document.addEventListener('dragover', e => {
  e.preventDefault()
  screenWrap.classList.add('drag-over')
})
document.addEventListener('dragleave', e => {
  // Only remove class if leaving the window entirely
  if ((e as DragEvent).relatedTarget === null) {
    screenWrap.classList.remove('drag-over')
  }
})
document.addEventListener('drop', e => {
  e.preventDefault()
  screenWrap.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (file) dispatchFile(file)
})

// ── Controls ───────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  spectrum.start()
  setStatus('Running…', '#888')
  btnStart.disabled = true
  btnStop.disabled  = false
  canvas.focus()
})

btnStop.addEventListener('click', () => {
  spectrum.stop()
  setStatus('Stopped.', '#888')
  btnStart.disabled = false
  btnStop.disabled  = true
})

btnReset.addEventListener('click', () => {
  spectrum.reset()
  setStatus('Reset — running…', '#888')
  btnStart.disabled = true
  btnStop.disabled  = false
  canvas.focus()
})

// ── Keyboard ───────────────────────────────────────────────────────

canvas.setAttribute('tabindex', '0')

// Arrow keys go exclusively to Kempston (no Spectrum equivalent)
// Alt keys go to BOTH Kempston (fire) AND Spectrum keyboard (Symbol Shift)
const KEMPSTON_ONLY = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])
const KEMPSTON_FIRE = new Set(['AltLeft','AltRight'])

canvas.addEventListener('keydown', e => {
  const blocked = ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                   'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']
  if (blocked.includes(e.code)) e.preventDefault()

  if (KEMPSTON_ONLY.has(e.code)) {
    // Arrows → Kempston only
    spectrum.kempston.keyDown(e.code)
  } else if (KEMPSTON_FIRE.has(e.code)) {
    // Alt → Kempston fire + Spectrum Symbol Shift (needed for LOAD "")
    spectrum.kempston.keyDown(e.code)
    spectrum.keyboard.keyDown(e.code)
  } else {
    spectrum.keyboard.keyDown(e.code)
  }
})
canvas.addEventListener('keyup', e => {
  if (KEMPSTON_ONLY.has(e.code)) {
    spectrum.kempston.keyUp(e.code)
  } else if (KEMPSTON_FIRE.has(e.code)) {
    spectrum.kempston.keyUp(e.code)
    spectrum.keyboard.keyUp(e.code)
  } else {
    spectrum.keyboard.keyUp(e.code)
  }
})
canvas.addEventListener('click',  () => canvas.focus())

// ── Keyboard help ──────────────────────────────────────────────────

const helpEl = document.getElementById('kbd-help')
document.getElementById('btn-help')?.addEventListener('click', () => {
  helpEl?.classList.toggle('hidden')
})

// ── Tape controls ─────────────────────────────────────────────────

const btnTape   = document.getElementById('btn-tape')   as HTMLButtonElement
const btnSave   = document.getElementById('btn-save')   as HTMLButtonElement
const tapeInput = document.getElementById('tape-input') as HTMLInputElement
const tapePanel = document.getElementById('tape-panel') as HTMLElement
const tapeStatus = document.getElementById('tape-status') as HTMLSpanElement
const tapeBlocks = document.getElementById('tape-blocks') as HTMLElement

function updateTapeUI(): void {
  const tp = spectrum.tape
  tapeStatus.textContent = tp.isLoaded()
    ? `Block ${spectrum.tape['blockIndex'] ?? 0 + 1}/${tp.totalBlocks()} — ${tp.currentBlock()?.description ?? ''}`
    : 'No tape loaded'

  // Block list
  if (tp.isLoaded()) {
    tapeBlocks.innerHTML = Array.from(
      { length: tp.totalBlocks() },
      (_, i) => `<div style="color:${i === (spectrum.tape as any).blockIndex ? '#00d7d7' : '#666'}">${i+1}. ${tp.blockDescription(i)}</div>`
    ).join('')
  }
}

btnTape.addEventListener('click', () => tapeInput.click())

// ── Save snapshot ──────────────────────────────────────────────────

btnSave.addEventListener('click', () => {
  // Build a timestamp-based filename: tsspeccy-YYYYMMDD-HHMMSS.z80
  const now = new Date()
  const ts  = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const filename = `tsspeccy-${ts}.z80`
  spectrum.saveSnapshot(filename)
  setStatus(`Snapshot saved: ${filename}`)
})
function loadTapeFile(file: File): void {
  if (!romLoaded) { setStatus('Load a ROM first before loading a tape.', '#d7af00'); return }
  file.arrayBuffer().then(buf => {
    spectrum.loadTape(new Uint8Array(buf), file.name)
    spectrum.tape.onStateChange = () => updateTapeUI()
    tapePanel.style.display = ''
    updateTapeUI()
    setStatus(`Tape loaded: ${file.name}`)
  }).catch(e => setStatus(`Tape error: ${e}`))
}

tapeInput.addEventListener('change', () => {
  const file = tapeInput.files?.[0]
  if (file) loadTapeFile(file)
})

document.getElementById('tape-play')?.addEventListener('click',  () => { spectrum.tape.play();  updateTapeUI() })
document.getElementById('tape-pause')?.addEventListener('click', () => { spectrum.tape.pause(); updateTapeUI() })
document.getElementById('tape-stop')?.addEventListener('click',  () => { spectrum.tape.stop();  updateTapeUI() })

document.getElementById('tape-turbo')?.addEventListener('click', () => {
  if (!spectrum.tape.isLoaded()) return

  // Ensure tape is rewound and playing before turbo
  spectrum.tape.rewind()
  spectrum.tape.play()

  const turboBtn = document.getElementById('tape-turbo') as HTMLButtonElement
  turboBtn.disabled = true
  turboBtn.textContent = '⚡ Loading…'
  setStatus('Turbo loading tape…')

  spectrum.turboLoad(
    (block, total, description) => {
      tapeStatus.textContent = `Block ${block + 1}/${total} — ${description}`
      updateTapeUI()
    },
    () => {
      turboBtn.disabled = false
      turboBtn.textContent = '⚡ Turbo'
      setStatus('Tape loaded ✓')
      updateTapeUI()
    }
  )
})

// ── Debug panel ────────────────────────────────────────────────────

const dbgContainer = document.getElementById('dbg-container')!
const dbg = new DebugPanel(spectrum.cpu, spectrum.mem, dbgContainer)

dbg.onPause  = () => {
  spectrum.stop()
  setStatus('Paused (debug)', '#d7af00')
  btnStart.disabled = false
  btnStop.disabled  = true
}
dbg.onResume = () => {
  spectrum.start()
  setStatus('Running…', '#888')
  btnStart.disabled = true
  btnStop.disabled  = false
}
dbg.onStep = () => {
  spectrum.cpu.step()
  dbg.refresh()
}

document.getElementById('btn-debug')?.addEventListener('click', () => {
  dbg.toggle()
})

// ── Init ──────────────────────────────────────────────────────────

// ── Welcome screen ────────────────────────────────────────────────

const welcomeEl = document.getElementById('welcome-screen')

function hideWelcome(): void {
  if (welcomeEl) welcomeEl.style.display = 'none'
}

// ── Auto-load ROM from localStorage ──────────────────────────────

;(function tryAutoLoadROM() {
  try {
    const name = localStorage.getItem('tsspeccy_rom_name')
    const b64  = localStorage.getItem('tsspeccy_rom_data')
    if (name && b64) {
      const data = base64ToBuffer(b64)
      loadROMFromData(name, data)
      setStatus(`ROM auto-loaded: ${name} — click Start`, '#00d7d7')
      return
    }
  } catch {
    // localStorage unavailable or corrupted
  }
  setStatus('Drop a .rom, .z80, .sna, .tap or .tzx file anywhere — or use the buttons above.')
})()

// ── Scale control ─────────────────────────────────────────────────

const scaleSelect   = document.getElementById('scale-select')  as HTMLSelectElement
const btnFullscreen = document.getElementById('btn-fullscreen') as HTMLButtonElement
const screenWrapEl  = document.getElementById('screen-wrap')   as HTMLElement

/** The Spectrum's internal resolution is 320×240 (including border).
 *  We scale it up by CSS — the canvas pixel count never changes. */
function applyScale(factor: number): void {
  const w = Math.round(320 * factor)
  const h = Math.round(240 * factor)
  document.documentElement.style.setProperty('--scale-w', `${w}px`)
  document.documentElement.style.setProperty('--scale-h', `${h}px`)
  // Widen helper panels to match
  const panels = document.querySelectorAll<HTMLElement>('#kbd-help, #tape-panel, #dbg-container')
  panels.forEach(el => { el.style.width = `${w}px` })
}

scaleSelect.addEventListener('change', () => {
  applyScale(parseFloat(scaleSelect.value))
})

// Apply default scale on load (reads the selected option)
applyScale(parseFloat(scaleSelect.value))

// Scale buttons (x1 x2 x3 x4)
document.querySelectorAll('.scale-btn[data-scale]').forEach(btn => {
  btn.addEventListener('click', () => {
    const factor = parseFloat((btn as HTMLElement).dataset['scale'] ?? '2')
    applyScale(factor)
    scaleSelect.value = String(factor)
    document.querySelectorAll('.scale-btn[data-scale]').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

// Fullscreen
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    screenWrapEl.requestFullscreen().catch(() => {})
  } else {
    document.exitFullscreen()
  }
})

document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    // Fill the screen — scale canvas to fit viewport maintaining 4:3
    const vw = window.innerWidth
    const vh = window.innerHeight
    const scale = Math.min(vw / 320, vh / 240)
    document.documentElement.style.setProperty('--scale-w', `${Math.floor(320 * scale)}px`)
    document.documentElement.style.setProperty('--scale-h', `${Math.floor(240 * scale)}px`)
    btnFullscreen.textContent = '✕ Exit'
  } else {
    // Restore selected scale
    applyScale(parseFloat(scaleSelect.value))
    btnFullscreen.textContent = '⛶ Full'
  }
})

// ── Speed control ──────────────────────────────────────────────────

const speedSelect = document.getElementById('speed-select') as HTMLSelectElement
const fpsDisplay  = document.getElementById('fps-display')  as HTMLSpanElement

speedSelect.addEventListener('change', () => {
  spectrum.speed = parseFloat(speedSelect.value)
})

// Real FPS counter — reads measured value from FrameLoop every 500ms
setInterval(() => {
  if (!spectrum.isRunning()) { fpsDisplay.textContent = ''; return }
  const fps    = spectrum.fps
  const target = Math.round(50 * spectrum.speed)
  const colour = fps >= target - 2 ? '#00d700'   // good: green
               : fps >= target - 8 ? '#d7af00'   // slow: amber
               : '#d75f5f'                        // bad:  red
  fpsDisplay.style.color = colour
  fpsDisplay.textContent = `${fps} fps`
}, 500)
