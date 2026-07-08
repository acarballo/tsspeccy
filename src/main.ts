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
    spectrum.loadROM(new Uint8Array(buf))
    romLoaded = true
    setStatus(`ROM: ${file.name} (${buf.byteLength} bytes) — ready`, '#00d7d7')
    btnStart.disabled  = false
    btnSnap.disabled   = false
    btnReset.disabled  = false
    btnTape.disabled   = false
  } catch (e) {
    setStatus(`ROM error: ${e}`, '#d75f5f')
  }
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
romInput.addEventListener('change', () => {
  const f = romInput.files?.[0]; if (f) loadROM(f)
})

btnSnap.addEventListener('click', () => snapInput.click())
snapInput.addEventListener('change', () => {
  const f = snapInput.files?.[0]; if (f) loadSnapshot(f)
})

// ── Drag and drop — detect ROM vs snapshot by extension ───────────

screenWrap.addEventListener('dragover', e => {
  e.preventDefault()
  screenWrap.classList.add('drag-over')
})
screenWrap.addEventListener('dragleave', () => screenWrap.classList.remove('drag-over'))
screenWrap.addEventListener('drop', e => {
  e.preventDefault()
  screenWrap.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (!file) return
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'rom' || ext === 'bin') {
    loadROM(file)
  } else if (ext === 'z80' || ext === 'sna') {
    loadSnapshot(file)
  } else {
    setStatus(`Unknown file type: .${ext}`, '#d7af00')
  }
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

canvas.addEventListener('keydown', e => {
  const blocked = ['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                   'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']
  if (blocked.includes(e.code)) e.preventDefault()
  spectrum.keyboard.keyDown(e.code)
})
canvas.addEventListener('keyup',  e => spectrum.keyboard.keyUp(e.code))
canvas.addEventListener('click',  () => canvas.focus())

// ── Keyboard help ──────────────────────────────────────────────────

const helpEl = document.getElementById('kbd-help')
document.getElementById('btn-help')?.addEventListener('click', () => {
  helpEl?.classList.toggle('hidden')
})

// ── Tape controls ─────────────────────────────────────────────────

const btnTape   = document.getElementById('btn-tape')   as HTMLButtonElement
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
tapeInput.addEventListener('change', () => {
  const file = tapeInput.files?.[0]
  if (!file) return
  file.arrayBuffer().then(buf => {
    spectrum.loadTape(new Uint8Array(buf), file.name)
    spectrum.tape.onStateChange = () => updateTapeUI()
    tapePanel.style.display = ''
    updateTapeUI()
    setStatus(`Tape loaded: ${file.name}`)
  }).catch(e => setStatus(`Tape error: ${e}`))
})

document.getElementById('tape-play')?.addEventListener('click',  () => { spectrum.tape.play();  updateTapeUI() })
document.getElementById('tape-pause')?.addEventListener('click', () => { spectrum.tape.pause(); updateTapeUI() })
document.getElementById('tape-stop')?.addEventListener('click',  () => { spectrum.tape.stop();  updateTapeUI() })

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

setStatus('Drop a .rom file or use Load ROM to begin.')

// ── Speed control ──────────────────────────────────────────────────

const speedSelect = document.getElementById('speed-select') as HTMLSelectElement
const fpsDisplay  = document.getElementById('fps-display')  as HTMLSpanElement

speedSelect.addEventListener('change', () => {
  spectrum.speed = parseFloat(speedSelect.value)
})

// Show approximate target FPS
setInterval(() => {
  if (!spectrum.isRunning()) { fpsDisplay.textContent = ''; return }
  const target = Math.min(60, Math.round(50 * spectrum.speed))
  fpsDisplay.textContent = `~${target} fps`
}, 500)
