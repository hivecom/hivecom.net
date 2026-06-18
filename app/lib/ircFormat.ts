// IRC text formatting: parsing of mIRC control codes and (modern-mode)
// markdown markers into styled segments, shared by the message log renderer
// and the chat composer. Control codes: \x02 bold, \x1D italic, \x1F underline,
// \x1E strikethrough, \x11 monospace, \x03 color, \x16 reverse, \x0F reset.

export interface StyleFlags {
  fg?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  mono?: boolean
}

export interface Segment extends StyleFlags {
  type: 'text' | 'link' | 'channel' | 'mention' | 'inline-image' | 'inline-video' | 'inline-youtube'
  value: string
}

// mIRC 99-color palette. Color 99 = transparent/default (omitted intentionally).
const MIRC_COLORS: Record<number, string> = {
  0: '#FFFFFF',
  1: '#000000',
  2: '#00007F',
  3: '#009300',
  4: '#FF0000',
  5: '#7F0000',
  6: '#9C009C',
  7: '#FC7F00',
  8: '#FFFF00',
  9: '#00FC00',
  10: '#009393',
  11: '#00FFFF',
  12: '#0000FC',
  13: '#FF00FF',
  14: '#7F7F7F',
  15: '#D2D2D2',
  16: '#470000',
  17: '#472100',
  18: '#474700',
  19: '#324700',
  20: '#004700',
  21: '#00472C',
  22: '#004747',
  23: '#002747',
  24: '#000047',
  25: '#2E0047',
  26: '#470047',
  27: '#47002A',
  28: '#740000',
  29: '#743A00',
  30: '#747400',
  31: '#517400',
  32: '#007400',
  33: '#007449',
  34: '#007474',
  35: '#004074',
  36: '#000074',
  37: '#4B0074',
  38: '#740074',
  39: '#740045',
  40: '#B50000',
  41: '#B56300',
  42: '#B5B500',
  43: '#7DB500',
  44: '#00B500',
  45: '#00B571',
  46: '#00B5B5',
  47: '#0063B5',
  48: '#0000B5',
  49: '#7500B5',
  50: '#B500B5',
  51: '#B5006B',
  52: '#FF0000',
  53: '#FF8C00',
  54: '#FFFF00',
  55: '#B2FF00',
  56: '#00FF00',
  57: '#00FFA0',
  58: '#00FFFF',
  59: '#008CFF',
  60: '#0000FF',
  61: '#A500FF',
  62: '#FF00FF',
  63: '#FF0098',
  64: '#FF5959',
  65: '#FFB459',
  66: '#FFFF71',
  67: '#CFFF60',
  68: '#6FFF6F',
  69: '#65FFC9',
  70: '#6DFFFF',
  71: '#59B4FF',
  72: '#5959FF',
  73: '#C459FF',
  74: '#FF66FF',
  75: '#FF59BC',
  76: '#FF9C9C',
  77: '#FFD39C',
  78: '#FFFF9C',
  79: '#E2FF9C',
  80: '#9CFF9C',
  81: '#9CFFDB',
  82: '#9CFFFF',
  83: '#9CD3FF',
  84: '#9C9CFF',
  85: '#DC9CFF',
  86: '#FF9CFF',
  87: '#FF94D3',
  88: '#000000',
  89: '#131313',
  90: '#282828',
  91: '#363636',
  92: '#4D4D4D',
  93: '#656565',
  94: '#818181',
  95: '#9F9F9F',
  96: '#BCBCBC',
  97: '#E2E2E2',
  98: '#FFFFFF',
}

export function mircColor(n: number): string | undefined {
  return n === 99 ? undefined : MIRC_COLORS[n]
}

export function segStyle(seg: StyleFlags): Record<string, string> | undefined {
  const style: Record<string, string> = {}
  if (seg.fg)
    style.color = seg.fg
  if (seg.bg)
    style.backgroundColor = seg.bg
  if (seg.bold)
    style.fontWeight = 'bold'
  if (seg.italic)
    style.fontStyle = 'italic'
  // Underline and strikethrough both map to text-decoration, so combine them.
  const decorations: string[] = []
  if (seg.underline)
    decorations.push('underline')
  if (seg.strike)
    decorations.push('line-through')
  if (decorations.length)
    style.textDecoration = decorations.join(' ')
  if (seg.mono) {
    style.fontFamily = 'monospace'
    // Subtle chip so inline code stands apart. Skip the background if an IRC
    // color code already set one, so we don't clobber it.
    if (!seg.bg)
      style.backgroundColor = 'var(--color-bg-medium)'
    style.padding = '0.1em 0.3em'
    style.borderRadius = 'var(--border-radius-xs)'
  }
  return Object.keys(style).length ? style : undefined
}

export function sameStyle(a: StyleFlags, b: StyleFlags): boolean {
  return a.fg === b.fg && a.bg === b.bg
    && !!a.bold === !!b.bold && !!a.italic === !!b.italic
    && !!a.underline === !!b.underline && !!a.strike === !!b.strike
    && !!a.mono === !!b.mono
}

export function parseIrcFormatting(text: string): Segment[] {
  const out: Segment[] = []
  let i = 0
  let fg: string | undefined
  let bg: string | undefined
  let bold = false
  let italic = false
  let underline = false
  let strike = false
  let mono = false
  let segStart = 0

  function flush(end: number) {
    if (end > segStart) {
      const seg: Segment = { type: 'text', value: text.slice(segStart, end) }
      if (fg !== undefined)
        seg.fg = fg
      if (bg !== undefined)
        seg.bg = bg
      if (bold)
        seg.bold = true
      if (italic)
        seg.italic = true
      if (underline)
        seg.underline = true
      if (strike)
        seg.strike = true
      if (mono)
        seg.mono = true
      out.push(seg)
    }
    segStart = i
  }

  while (i < text.length) {
    const code = text.charCodeAt(i)
    if (code === 0x03) {
      flush(i)
      i++
      let fgStr = ''
      if (i < text.length && /\d/.test(text.charAt(i))) {
        fgStr += text.charAt(i++)
        if (i < text.length && /\d/.test(text.charAt(i)))
          fgStr += text.charAt(i++)
      }
      let bgStr = ''
      if (i < text.length && text.charAt(i) === ',') {
        i++
        if (i < text.length && /\d/.test(text.charAt(i))) {
          bgStr += text.charAt(i++)
          if (i < text.length && /\d/.test(text.charAt(i)))
            bgStr += text.charAt(i++)
        }
      }
      if (fgStr === '') {
        fg = undefined
        bg = undefined
      }
      else {
        fg = mircColor(Number.parseInt(fgStr, 10))
        if (bgStr !== '')
          bg = mircColor(Number.parseInt(bgStr, 10))
      }
      segStart = i
    }
    else if (code === 0x02) {
      flush(i)
      bold = !bold
      i++
      segStart = i
    }
    else if (code === 0x1D) {
      flush(i)
      italic = !italic
      i++
      segStart = i
    }
    else if (code === 0x1F) {
      flush(i)
      underline = !underline
      i++
      segStart = i
    }
    else if (code === 0x1E) {
      flush(i)
      strike = !strike
      i++
      segStart = i
    }
    else if (code === 0x11) {
      flush(i)
      mono = !mono
      i++
      segStart = i
    }
    else if (code === 0x16) {
      flush(i)
      ;[fg, bg] = [bg, fg]
      i++
      segStart = i
    }
    else if (code === 0x0F) {
      flush(i)
      fg = undefined
      bg = undefined
      bold = false
      italic = false
      underline = false
      strike = false
      mono = false
      i++
      segStart = i
    }
    else {
      i++
    }
  }
  flush(i)
  return out
}

// Modern-mode markdown layer. IRC clients send invisible control codes; bridged
// platforms (Discord etc.) send only the literal markers (**bold**, `code`).
// This runs on top of the IRC-parsed segments so both round-trip: it applies
// the matching style and removes the markers.
// Underscore rules are guarded with `\b` word boundaries so they only fire at
// word edges - this keeps `snake_case`, `__dunder__`, and underscores in nicks
// or URLs from being mangled into emphasis. Asterisks intentionally stay
// intraword-friendly (CommonMark allows `foo*bar*baz`).
export const MD_RULES: { re: RegExp, len: number, flag: 'bold' | 'italic' | 'underline' | 'strike' | 'mono' }[] = [
  { re: /\*\*(\S(?:[^*\n]*\S)?)\*\*/g, len: 2, flag: 'bold' },
  { re: /\b__(\S(?:[^_\n]*\S)?)__\b/g, len: 2, flag: 'underline' },
  { re: /~~(\S(?:[^~\n]*\S)?)~~/g, len: 2, flag: 'strike' },
  { re: /\*(\S(?:[^*\n]*\S)?)\*/g, len: 1, flag: 'italic' },
  // Single underscore italics (Discord-style). Runs after `__` underline so the
  // double-underscore markers are already consumed and won't be re-matched.
  { re: /\b_(\S(?:[^_\n]*\S)?)_\b/g, len: 1, flag: 'italic' },
]

// `strip` removes the markers (modern mode); when false the markers are kept in
// place with their surrounding style (classic IRC mode keeps asterisks etc.
// while still styling the content between them).
export function applyMarkdown(segs: Segment[], strip = true): Segment[] {
  // Expand to per-character cells that carry their IRC-derived style, so marker
  // detection can run on the plain text while preserving control-code styling.
  interface Cell { ch: string, style: StyleFlags, del: boolean, code: boolean }
  const cells: Cell[] = []
  for (const seg of segs) {
    const { value, type: _t, ...style } = seg
    for (const ch of value)
      cells.push({ ch, style: { ...style }, del: false, code: false })
  }
  if (!cells.length)
    return segs

  const plain = cells.map(c => c.ch).join('')
  const free = (positions: number[]) => positions.every(p => !cells[p]!.del)

  // Inline code wins over emphasis and suppresses markers inside it.
  for (const m of plain.matchAll(/`[^`\n]+`/g)) {
    const s = m.index
    const e = s + m[0].length
    if (!free([s, e - 1]))
      continue
    cells[s]!.del = true
    cells[e - 1]!.del = true
    for (let k = s + 1; k < e - 1; k++) {
      cells[k]!.style.mono = true
      cells[k]!.code = true
    }
  }

  // Emphasis. Order matters: ** is consumed before * so they don't collide.
  for (const { re, len, flag } of MD_RULES) {
    for (const m of plain.matchAll(re)) {
      const s = m.index
      const e = s + m[0].length
      const markers: number[] = []
      for (let k = 0; k < len; k++)
        markers.push(s + k, e - 1 - k)
      if (!free(markers))
        continue
      let inCode = false
      for (let k = s + len; k < e - len; k++) {
        if (cells[k]!.code) {
          inCode = true
          break
        }
      }
      if (inCode)
        continue
      for (const p of markers) cells[p]!.del = true
      for (let k = s + len; k < e - len; k++) cells[k]!.style[flag] = true
    }
  }

  // Coalesce surviving cells with identical style back into text segments.
  const out: Segment[] = []
  let cur: Segment | null = null
  for (const cell of cells) {
    if (cell.del && strip)
      continue
    if (cur && sameStyle(cur, cell.style)) {
      cur.value += cell.ch
    }
    else {
      cur = { type: 'text', value: cell.ch, ...cell.style }
      out.push(cur)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Editor tokenizer
// ---------------------------------------------------------------------------
// The composer renders into a contenteditable. Unlike the message log, it must
// keep EVERY source character in the DOM (control codes and markdown markers
// included) so the DOM text length stays 1:1 with the wire string and the caret
// offset maps directly. Formatting characters are emitted as `hidden` tokens
// that the composer renders zero-width; visible text carries the resolved style.

export interface EditorToken {
  text: string
  hidden: boolean
  style: StyleFlags
}

// `strip` (default true, modern mode) hides the consumed markdown markers (** etc)
// the same way the message renderer does; pass false (classic/IRC mode) to keep
// them visible while still styling the content between them. Control codes are
// always hidden - they're non-printable either way.
export function tokenizeForEditor(text: string, strip = true): EditorToken[] {
  interface Cell { ch: string, style: StyleFlags, hidden: boolean, code: boolean, del: boolean }
  const cells: Cell[] = []
  let i = 0
  let fg: string | undefined
  let bg: string | undefined
  let bold = false
  let italic = false
  let underline = false
  let strike = false
  let mono = false

  const pushHidden = (ch: string) => cells.push({ ch, style: {}, hidden: true, code: false, del: false })
  function curStyle(): StyleFlags {
    const s: StyleFlags = {}
    if (fg !== undefined)
      s.fg = fg
    if (bg !== undefined)
      s.bg = bg
    if (bold)
      s.bold = true
    if (italic)
      s.italic = true
    if (underline)
      s.underline = true
    if (strike)
      s.strike = true
    if (mono)
      s.mono = true
    return s
  }

  // Pass 1: walk the source, hiding control codes and tracking active style.
  while (i < text.length) {
    const code = text.charCodeAt(i)
    if (code === 0x03) {
      pushHidden(text.charAt(i++))
      let fgStr = ''
      if (i < text.length && /\d/.test(text.charAt(i))) {
        fgStr += text.charAt(i)
        pushHidden(text.charAt(i++))
        if (i < text.length && /\d/.test(text.charAt(i))) {
          fgStr += text.charAt(i)
          pushHidden(text.charAt(i++))
        }
      }
      let bgStr = ''
      if (i < text.length && text.charAt(i) === ',') {
        pushHidden(text.charAt(i++))
        if (i < text.length && /\d/.test(text.charAt(i))) {
          bgStr += text.charAt(i)
          pushHidden(text.charAt(i++))
          if (i < text.length && /\d/.test(text.charAt(i))) {
            bgStr += text.charAt(i)
            pushHidden(text.charAt(i++))
          }
        }
      }
      if (fgStr === '') {
        fg = undefined
        bg = undefined
      }
      else {
        fg = mircColor(Number.parseInt(fgStr, 10))
        if (bgStr !== '')
          bg = mircColor(Number.parseInt(bgStr, 10))
      }
    }
    else if (code === 0x02) {
      bold = !bold
      pushHidden(text.charAt(i++))
    }
    else if (code === 0x1D) {
      italic = !italic
      pushHidden(text.charAt(i++))
    }
    else if (code === 0x1F) {
      underline = !underline
      pushHidden(text.charAt(i++))
    }
    else if (code === 0x1E) {
      strike = !strike
      pushHidden(text.charAt(i++))
    }
    else if (code === 0x11) {
      mono = !mono
      pushHidden(text.charAt(i++))
    }
    else if (code === 0x16) {
      ;[fg, bg] = [bg, fg]
      pushHidden(text.charAt(i++))
    }
    else if (code === 0x0F) {
      fg = undefined
      bg = undefined
      bold = false
      italic = false
      underline = false
      strike = false
      mono = false
      pushHidden(text.charAt(i++))
    }
    else {
      cells.push({ ch: text.charAt(i++), style: curStyle(), hidden: false, code: false, del: false })
    }
  }

  // Pass 2: markdown markers, scanned over the visible (non-code) characters.
  const visIdx: number[] = []
  let plain = ''
  for (let k = 0; k < cells.length; k++) {
    if (!cells[k]!.hidden) {
      plain += cells[k]!.ch
      visIdx.push(k)
    }
  }
  const cellAt = (plainPos: number) => cells[visIdx[plainPos]!]!
  const free = (positions: number[]) => positions.every(p => !cellAt(p).del)

  for (const m of plain.matchAll(/`[^`\n]+`/g)) {
    const s = m.index
    const e = s + m[0].length
    if (!free([s, e - 1]))
      continue
    cellAt(s).del = true
    cellAt(e - 1).del = true
    for (let k = s + 1; k < e - 1; k++) {
      cellAt(k).style.mono = true
      cellAt(k).code = true
    }
  }

  for (const { re, len, flag } of MD_RULES) {
    for (const m of plain.matchAll(re)) {
      const s = m.index
      const e = s + m[0].length
      const markers: number[] = []
      for (let k = 0; k < len; k++)
        markers.push(s + k, e - 1 - k)
      if (!free(markers))
        continue
      let inCode = false
      for (let k = s + len; k < e - len; k++) {
        if (cellAt(k).code) {
          inCode = true
          break
        }
      }
      if (inCode)
        continue
      for (const p of markers) cellAt(p).del = true
      for (let k = s + len; k < e - len; k++) cellAt(k).style[flag] = true
    }
  }

  // Coalesce into tokens. Hidden runs (codes + consumed markers) group together;
  // visible runs group by identical style.
  const tokens: EditorToken[] = []
  let cur: EditorToken | null = null
  for (const cell of cells) {
    // Control codes (cell.hidden) are always hidden; consumed markers (cell.del)
    // are hidden only in strip mode, otherwise they stay visible (classic IRC).
    const hidden = cell.hidden || (cell.del && strip)
    if (cur && cur.hidden === hidden && (hidden || sameStyle(cur.style, cell.style))) {
      cur.text += cell.ch
    }
    else {
      cur = { text: cell.ch, hidden, style: hidden ? {} : cell.style }
      tokens.push(cur)
    }
  }
  return tokens
}
