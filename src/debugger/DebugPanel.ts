/**
 * DebugPanel
 *
 * In-browser debugger panel. Shows:
 *   - CPU registers (updated each step)
 *   - Disassembly of instructions around PC
 *   - Breakpoints
 *   - Step / Run / Pause controls
 */
import type { CPU }     from '../cpu/CPU.js'
import type { Memory }  from '../memory/Memory.js'
import { Disassembler } from './Disassembler.js'

function hex8(n: number):  string { return n.toString(16).toUpperCase().padStart(2,'0') }
function hex16(n: number): string { return n.toString(16).toUpperCase().padStart(4,'0') }

export class DebugPanel {
  private readonly disasm: Disassembler
  private readonly el: HTMLElement
  private breakpoints = new Set<number>()
  private visible = false

  // Callbacks wired by main.ts
  onPause?: () => void
  onResume?: () => void
  onStep?: () => void

  constructor(
    private readonly cpu: CPU,
    private readonly mem: Memory,
    container: HTMLElement,
  ) {
    this.disasm = new Disassembler(mem)
    this.el = this.build()
    container.appendChild(this.el)
  }

  // ─────────────────────────────────────────────────────────────────
  // Build DOM
  // ─────────────────────────────────────────────────────────────────

  private build(): HTMLElement {
    const panel = document.createElement('div')
    panel.id = 'dbg-panel'
    panel.innerHTML = `
<div id="dbg-header">
  <span>🔬 DEBUGGER</span>
  <div id="dbg-controls">
    <button id="dbg-pause">⏸ Pause</button>
    <button id="dbg-step"  disabled>⏭ Step</button>
    <button id="dbg-run"   disabled>▶ Run</button>
    <button id="dbg-close">✕</button>
  </div>
</div>
<div id="dbg-body">
  <div id="dbg-regs"></div>
  <div id="dbg-disasm"></div>
</div>
<style>
#dbg-panel {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  background: #111;
  color: #c8c8c8;
  border: 1px solid #444;
  border-radius: 4px;
  margin-top: 12px;
  user-select: none;
}
#dbg-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  color: #00d7d7;
  font-size: 11px;
  letter-spacing: .1em;
}
#dbg-controls { display: flex; gap: 6px; }
#dbg-controls button {
  padding: 3px 10px;
  background: #2a2a2a; border: 1px solid #555;
  color: #c8c8c8; border-radius: 3px;
  font-family: inherit; font-size: 11px; cursor: pointer;
}
#dbg-controls button:hover:not(:disabled) { background:#3a3a3a; border-color:#888; }
#dbg-controls button:disabled { opacity:.35; cursor:not-allowed; }
#dbg-body { display: flex; gap: 0; }
#dbg-regs {
  padding: 8px 12px;
  border-right: 1px solid #333;
  min-width: 200px;
  line-height: 1.7;
}
#dbg-disasm {
  padding: 8px 12px;
  flex: 1;
  overflow-y: auto;
  max-height: 220px;
}
.dbg-reg-row { display: flex; gap: 12px; }
.dbg-reg { color: #888; }
.dbg-val { color: #d7d700; }
.dbg-flags { color: #888; margin-top: 4px; }
.dbg-flag-on  { color: #00d700; font-weight: bold; }
.dbg-flag-off { color: #444; }
.dbg-line { display: flex; gap: 8px; padding: 1px 4px; border-radius: 2px; cursor: pointer; }
.dbg-line:hover { background: #222; }
.dbg-line.dbg-current { background: #1a3a1a; color: #00ff00; }
.dbg-line.dbg-break   { background: #3a1a1a; }
.dbg-addr { color: #888; min-width: 44px; }
.dbg-bytes { color: #555; min-width: 80px; font-size: 10px; }
.dbg-mnem { color: #e0e0e0; }
.dbg-mnem .kw { color: #00d7d7; }
.dbg-bp { width: 8px; min-width: 8px; color: #ff4444; }
</style>`

    panel.querySelector('#dbg-pause')!.addEventListener('click', () => this.pause())
    panel.querySelector('#dbg-step')!.addEventListener('click',  () => this.step())
    panel.querySelector('#dbg-run')!.addEventListener('click',   () => this.resume())
    panel.querySelector('#dbg-close')!.addEventListener('click', () => this.hide())

    return panel
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  show(): void  { this.el.style.display = ''; this.visible = true; this.refresh() }
  hide(): void  { this.el.style.display = 'none'; this.visible = false }
  toggle(): void { this.visible ? this.hide() : this.show() }

  /** Call after each step or frame to update the display */
  refresh(): void {
    if (!this.visible) return
    this.renderRegs()
    this.renderDisasm()
  }

  private paused = false

  private pause(): void {
    this.paused = true
    const btn = this.el.querySelector('#dbg-pause') as HTMLButtonElement
    const step = this.el.querySelector('#dbg-step')  as HTMLButtonElement
    const run  = this.el.querySelector('#dbg-run')   as HTMLButtonElement
    btn.disabled  = true
    step.disabled = false
    run.disabled  = false
    this.onPause?.()
    this.refresh()
  }

  private resume(): void {
    this.paused = false
    const btn  = this.el.querySelector('#dbg-pause') as HTMLButtonElement
    const step = this.el.querySelector('#dbg-step')  as HTMLButtonElement
    const run  = this.el.querySelector('#dbg-run')   as HTMLButtonElement
    btn.disabled  = false
    step.disabled = true
    run.disabled  = true
    this.onResume?.()
  }

  private step(): void {
    this.onStep?.()
    this.refresh()
  }

  // ─────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────

  private renderRegs(): void {
    const r = this.cpu.regs
    const f = r.F
    const flag = (bit: number, name: string) =>
      `<span class="${(f & bit) ? 'dbg-flag-on' : 'dbg-flag-off'}">${name}</span>`

    const regsEl = this.el.querySelector('#dbg-regs')!
    regsEl.innerHTML = `
<div class="dbg-reg-row">
  <span><span class="dbg-reg">AF</span> <span class="dbg-val">${hex16(r.AF)}</span></span>
  <span><span class="dbg-reg">BC</span> <span class="dbg-val">${hex16(r.BC)}</span></span>
</div>
<div class="dbg-reg-row">
  <span><span class="dbg-reg">DE</span> <span class="dbg-val">${hex16(r.DE)}</span></span>
  <span><span class="dbg-reg">HL</span> <span class="dbg-val">${hex16(r.HL)}</span></span>
</div>
<div class="dbg-reg-row">
  <span><span class="dbg-reg">IX</span> <span class="dbg-val">${hex16(r.IX)}</span></span>
  <span><span class="dbg-reg">IY</span> <span class="dbg-val">${hex16(r.IY)}</span></span>
</div>
<div class="dbg-reg-row">
  <span><span class="dbg-reg">SP</span> <span class="dbg-val">${hex16(r.SP)}</span></span>
  <span><span class="dbg-reg">PC</span> <span class="dbg-val">${hex16(r.PC)}</span></span>
</div>
<div class="dbg-reg-row">
  <span><span class="dbg-reg">AF'</span> <span class="dbg-val">${hex8(r.A_)}${hex8(r.F_)}</span></span>
  <span><span class="dbg-reg">IM</span> <span class="dbg-val">${r.IM}</span></span>
</div>
<div class="dbg-flags" style="margin-top:6px">
  ${flag(0x80,'S')} ${flag(0x40,'Z')} ${flag(0x10,'H')} ${flag(0x04,'V')} ${flag(0x02,'N')} ${flag(0x01,'C')}
  &nbsp; IFF1:<span class="${r.IFF1?'dbg-flag-on':'dbg-flag-off'}">${r.IFF1?'1':'0'}</span>
  <span class="${this.cpu.halted?'dbg-flag-on':'dbg-flag-off'}">${this.cpu.halted?'HALT':''}</span>
</div>`
  }

  private renderDisasm(): void {
    // Show 4 instructions before PC, then 10 after
    const startAddr = Math.max(0, this.cpu.regs.PC - 8)
    const lines = this.disasm.disassemble(startAddr, 18)
    const pc    = this.cpu.regs.PC

    const disEl = this.el.querySelector('#dbg-disasm')!
    disEl.innerHTML = lines.map(line => {
      const isCurrent = line.addr === pc
      const isBreak   = this.breakpoints.has(line.addr)
      const cls = [
        'dbg-line',
        isCurrent ? 'dbg-current' : '',
        isBreak   ? 'dbg-break'   : '',
      ].join(' ')
      const bytes = line.bytes.map(b => hex8(b)).join(' ')
      const mnem = line.mnem.replace(
        /^(\w+)/,
        '<span class="kw">$1</span>'
      )
      return `<div class="${cls}" data-addr="${line.addr}">
  <span class="dbg-bp">${isBreak ? '●' : ' '}</span>
  <span class="dbg-addr">${hex16(line.addr)}</span>
  <span class="dbg-bytes">${bytes.padEnd(11)}</span>
  <span class="dbg-mnem">${mnem}</span>
</div>`
    }).join('')

    // Click to toggle breakpoint
    disEl.querySelectorAll('.dbg-line').forEach(el => {
      el.addEventListener('click', () => {
        const addr = parseInt((el as HTMLElement).dataset['addr'] ?? '0', 10)
        if (this.breakpoints.has(addr)) this.breakpoints.delete(addr)
        else this.breakpoints.add(addr)
        this.renderDisasm()
      })
    })

    // Scroll current instruction into view
    disEl.querySelector('.dbg-current')?.scrollIntoView({ block: 'nearest' })
  }

  hasBreakpoint(addr: number): boolean { return this.breakpoints.has(addr) }
  isPaused(): boolean { return this.paused }
}
