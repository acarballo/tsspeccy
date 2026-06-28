/**
 * main.ts — browser entry point
 */
import { Spectrum } from './Spectrum.js'

const canvas   = document.getElementById('screen')   as HTMLCanvasElement
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

// ── ROM loading ────────────────────────────────────────────────────

async function loadROM(file: File): Promise<void> {
  try {
    const buf = await file.arrayBuffer()
    spectrum.loadROM(new Uint8Array(buf))
    setStatus(`ROM loaded: ${file.name} (${buf.byteLength} bytes) — click Start`)
    btnStart.disabled = false
    btnReset.disabled = false
  } catch (e) {
    setStatus(`Error loading ROM: ${e}`)
  }
}

btnLoad.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) loadROM(file)
})

// ── Drag and drop ──────────────────────────────────────────────────

const screenWrap = document.getElementById('screen-wrap')!
screenWrap.addEventListener('dragover', e => {
  e.preventDefault()
  screenWrap.classList.add('drag-over')
})
screenWrap.addEventListener('dragleave', () => screenWrap.classList.remove('drag-over'))
screenWrap.addEventListener('drop', e => {
  e.preventDefault()
  screenWrap.classList.remove('drag-over')
  const file = e.dataTransfer?.files[0]
  if (file) loadROM(file)
})

// ── Controls ───────────────────────────────────────────────────────

btnStart.addEventListener('click', () => {
  spectrum.start()
  setStatus('Running…')
  btnStart.disabled = true
  btnStop.disabled  = false
  canvas.focus()
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
  canvas.focus()
})

// ── Keyboard ───────────────────────────────────────────────────────
// Canvas must be focusable to receive key events

canvas.setAttribute('tabindex', '0')

canvas.addEventListener('keydown', e => {
  // Prevent browser shortcuts (F5, arrows, space scrolling…)
  const blocked = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                   'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']
  if (blocked.includes(e.code)) e.preventDefault()

  spectrum.keyboard.keyDown(e.code)
})

canvas.addEventListener('keyup', e => {
  spectrum.keyboard.keyUp(e.code)
})

// Re-focus canvas on click so keys work immediately
canvas.addEventListener('click', () => canvas.focus())

// ── Keyboard help overlay ──────────────────────────────────────────

const helpEl = document.getElementById('kbd-help')
document.getElementById('btn-help')?.addEventListener('click', () => {
  if (helpEl) helpEl.classList.toggle('hidden')
})

// ── Init ──────────────────────────────────────────────────────────

setStatus('Load a .rom file to begin.')
