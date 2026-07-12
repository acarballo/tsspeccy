# tsspeccy 🎮

ZX Spectrum 48K emulator in TypeScript, runs in the browser.

## Quick start

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm test          # run all tests (226 passing)
npm run build     # production build
```

## How to use

### 1. Load ROM
Click **📂 Load ROM** and select the Spectrum 48K ROM file (`48.rom`, 16 KB).  
The emulator fast-boots past the RAM test and lands directly in the BASIC editor.

### 2. Load a game

**Snapshot (instant load):**
1. Click **🎮 Load Snapshot** and select a `.z80` or `.sna` file
2. The game starts immediately

**Tape (classic loading experience):**
1. Click **Start** to boot into BASIC
2. Click the screen to focus it, then type:
   - `J` → `LOAD`
   - `Alt+P` → opens `"`
   - `Alt+P` → closes `""`
   - `Enter` → screen goes black, cursor `L` flashing = waiting for tape
3. Click **📼 Load Tape** and select a `.tap` or `.tzx` file
4. Click **▶ Play** in the tape panel — loading bars appear

### 3. Controls

| Button | Action |
|---|---|
| ▶ Start | Begin emulation |
| ⏹ Stop | Pause emulation |
| ↺ Reset | Restart from ROM entry point |
| ⏱ Speed | `×0.5` slow · `×1.0` real speed · `×2–8` turbo |
| 🖥 Scale | ×1 (320×240) · ×2 (640×480) · ×3 · ×4 |
| ⛶ Full | Fullscreen mode |
| 🔬 Debug | Toggle debugger panel |

---

## ZX Spectrum 48K keyboard guide

### Key mapping (PC → Spectrum)

| PC key | Spectrum key |
|---|---|
| `A` – `Z` | Letter keys |
| `0` – `9` | Number keys |
| `Shift` (left or right) | **Caps Shift** |
| `Alt` (left or right) | **Symbol Shift** |
| `Enter` | **Enter** |
| `Space` | **Space** |

### Cursor and editing

| PC key | Spectrum | Function |
|---|---|---|
| `Shift + 5` | Caps + 5 | ← cursor left |
| `Shift + 6` | Caps + 6 | ↓ cursor down |
| `Shift + 7` | Caps + 7 | ↑ cursor up |
| `Shift + 8` | Caps + 8 | → cursor right |
| `Shift + 0` | Caps + 0 | **DELETE** (backspace) |
| `Shift + 1` | Caps + 1 | **EDIT** (recall last line) |
| `Shift + 9` | Caps + 9 | **GRAPHICS** mode |
| `Shift + 2` | Caps + 2 | **CAPS LOCK** toggle |

### Symbols via Symbol Shift (Alt)

| PC key | Result | PC key | Result |
|---|---|---|---|
| `Alt + Q` | `@` | `Alt + W` | `£` |
| `Alt + E` | | `Alt + R` | `<` |
| `Alt + T` | `>` | `Alt + Y` | `[` |
| `Alt + U` | `]` | `Alt + I` | `IN` |
| `Alt + O` | `;` | `Alt + P` | `"` |
| `Alt + A` | `~` | `Alt + S` | `\|` |
| `Alt + D` | `\` | `Alt + F` | `{` |
| `Alt + G` | `}` | `Alt + H` | `^` |
| `Alt + J` | `-` | `Alt + K` | `+` |
| `Alt + L` | `=` | `Alt + Z` | `:` |
| `Alt + X` | `£` | `Alt + C` | `?` |
| `Alt + V` | `/` | `Alt + B` | `*` |
| `Alt + N` | `,` | `Alt + M` | `.` |
| `Alt + 1` | `!` | `Alt + 2` | `@` |
| `Alt + 3` | `#` | `Alt + 4` | `$` |
| `Alt + 5` | `%` | `Alt + 6` | `&` |
| `Alt + 7` | `'` | `Alt + 8` | `(` |
| `Alt + 9` | `)` | `Alt + 0` | `_` |

### BASIC keyword mode (cursor `K`)

When the cursor shows `K`, each letter key types a complete BASIC keyword:

| Key | Keyword | Key | Keyword |
|---|---|---|---|
| `A` | `NEW` | `B` | `BORDER` |
| `C` | `CONTINUE` | `D` | `DIM` |
| `E` | `REM` | `F` | `FOR` |
| `G` | `GO TO` | `H` | `GO SUB` |
| `I` | `INPUT` | `J` | `LOAD` |
| `K` | `LIST` | `L` | `LET` |
| `M` | `MERGE` | `N` | `NEXT` |
| `O` | `OPEN #` | `P` | `PRINT` |
| `Q` | `PLOT` | `R` | `RUN` |
| `S` | `SAVE` | `T` | `RANDOMIZE` |
| `U` | `IF` | `V` | `VERIFY` |
| `W` | `CLS` | `X` | `COPY` |
| `Y` | `ERASE` | `Z` | `STOP` |

### Common BASIC commands

```
LOAD ""        → wait for tape (J, Alt+P, Alt+P, Enter)
RUN            → run program in memory
LIST           → list BASIC program
NEW            → clear program memory
BORDER 2       → change border colour (0=black … 7=white)
PAPER 0: INK 7 → black background, white text
CLEAR 32767    → clear memory above address
```

### Clearing the input line

- **`Shift + 0`** repeatedly — deletes characters one by one
- Press **`Enter`** to accept the (wrong) line, let it error, then retype
- **`Shift + 1`** — EDIT recalls the last entered line for correction

---

## Project structure

```
src/
  cpu/          ← Z80 CPU (all opcodes + CB/ED/DD/FD prefixes)
  memory/       ← 64 KB address space, ROM protection
  ula/          ← Video (ULA), frame loop, renderer
  io/           ← I/O bus, keyboard matrix
  audio/        ← Beeper (Web Audio API)
  tape/         ← TAP/TZX parser and player
  snapshot/     ← Z80 (v1/v2/v3) and SNA snapshot loader
  debugger/     ← Disassembler and debug panel
tests/
  cpu/          ← 60+ CPU instruction tests
  ula/          ← Video rendering tests
  io/           ← Keyboard and I/O bus tests
  tape/         ← TAP/TZX parser and player tests
  snapshot/     ← Snapshot format tests
  debugger/     ← Disassembler tests
```

## Implemented features

- [x] Z80 CPU — all opcodes, CB/ED/DD/FD/DDCB/FDCB prefixes
- [x] R register auto-increment, EI one-instruction delay
- [x] ULA — 256×192 bitmap, 16 colours, flash, border
- [x] Keyboard — full 5×8 matrix
- [x] Audio — beeper (Web Audio API, square wave synthesis)
- [x] Snapshots — `.z80` v1/v2/v3 and `.sna`
- [x] Tape — `.tap` and `.tzx` (blocks 0x10/0x11/0x12/0x13/0x14/0x20)
- [x] Debugger — registers, disassembler, breakpoints, step/run
- [x] Speed control — ×0.5 to ×8
- [x] Scale control — ×1 to ×4 + fullscreen

## Where to find games

- [World of Spectrum](https://worldofspectrum.org) — `.tap`, `.tzx`, `.z80`, `.sna`
- [Speccy.pl](https://speccy.pl) — large archive of snapshots
- [Archive.org ZX Spectrum collection](https://archive.org/details/softwarelibrary_zx_spectrum)
