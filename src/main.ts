/**
 * main.ts — browser entry point
 *
 * Handles:
 *  - ROM file drag-and-drop / file picker
 *  - Start / Stop / Reset controls
 *  - Status display
 */
import { Spectrum } from './Spectrum.js'

const canvas  = document.getElementById('screen')  as HTMLCanvasElement
const btnLoad  = document.getElementById('btn-load')  as HTMLButtonElement
const btnStart = document.getElementById('btn-start') as HTMLButtonElement
const btnStop  = document.getElementById('btn-stop')  as HTMLButtonElement
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement
const fileInput = document.getElementById('rom-input') as HTMLInputElement
const statusEl  = document.getElementById('status')   as HTMLSpanElement

const spectrum = new Spectrum(canvas)

function setStatus(msg: string): void {
  statusEl.textContent = msg
}

async function loadROM(file: File): Promise<void> {
  try {
    const buf = await file.arrayBuffer()
    spectrum.loadROM(new Uint8Array(buf))
    setStatus(`ROM loaded: ${file.name} (${buf.byteLength} bytes)`)
    btnStart.disabled = false
    btnReset.disabled = false
  } catch (e) {
    setStatus(`Error loading ROM: ${e}`)
  }
}

// ── File picker ────────────────────────────────────────────────────
btnLoad.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) loadROM(file)
})

// ── Drag and drop ──────────────────────────────────────────────────
canvas.addEventListener('dragover', e => { e.preventDefault(); canvas.classList.add('drag-over') })
canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'))
canvas.addEventListener('drop', e => {
  e.preventDefault()
  canvas.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (file) loadROM(file)
})

// ── Controls ───────────────────────────────────────────────────────
btnStart.addEventListener('click', () => {
  spectrum.start()
  setStatus('Running…')
  btnStart.disabled = true
  btnStop.disabled  = false
})

btnStop.addEventListener('click', () => {
  spectrum.stop()
  setStatus('Stopped.')
  btnStart.disabled = false
  btnStop.disabled  = true
})

btnReset.addEventListener('click', () => {
  spectrum.reset()
  setStatus('Reset — running…')
  btnStart.disabled = true
  btnStop.disabled  = false
})

setStatus('Load a .rom file to begin.')
