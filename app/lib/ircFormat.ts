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

  // Closes the run of text ending at `end` as one segment carrying whatever
  // styles are active right now.
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

  // Every control code closes the current segment.
  while (i < text.length) {
    const code = text.charCodeAt(i)

    if (code === 0x03) {
      flush(i)
      i++

      // Colour is `<fg>[,<bg>]`, one or two digits each, both optional.
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

      // A bare 0x03 with no digits clears colour instead of setting it.
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

// Modern-mode markdown layer. Bridged platforms like Discord send literal
// markers (**bold**, `code`) instead of control codes. This runs over the
// IRC-parsed cells: markers get del, the content between them gets the style.
// A delimiter stack lets emphasis nest, so ***both*** and **a *b* c** resolve.
// Underscores need a word boundary so snake_case and URLs survive. Asterisks
// work intraword, as CommonMark allows foo*bar*baz.
type EmFlag = 'bold' | 'italic' | 'underline' | 'strike' | 'mono'
interface MdCell { ch: string, style: StyleFlags, del: boolean, code: boolean }

const isWS = (c: string | undefined): boolean => c === undefined || /\s/.test(c)

// CommonMark's ASCII punctuation set.
const ASCII_PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
const isPunct = (c: string | undefined): boolean => c !== undefined && ASCII_PUNCT.includes(c)

// Inline code spans: a backtick run is closed by the next run of the SAME length.
// Content becomes mono and is marked `code` so emphasis markers inside stay literal.
function resolveCodeSpans(cells: MdCell[]): void {
  const n = cells.length
  let i = 0

  while (i < n) {
    if (cells[i]!.ch === '`' && !cells[i]!.del && !cells[i]!.code) {
      let j = i

      while (j < n && cells[j]!.ch === '`') j++

      const runLen = j - i
      let k = j
      let closed = false

      while (k < n) {
        if (cells[k]!.ch === '\n')
          break // a code span doesn't cross a hard line break (matches the old regex)

        if (cells[k]!.ch === '`' && !cells[k]!.code) {
          let m = k

          while (m < n && cells[m]!.ch === '`') m++

          // A run of a different length isn't the closer.
          if (m - k === runLen) {
            // Drop both backtick runs and mark everything between them as code.
            for (let p = i; p < j; p++) cells[p]!.del = true
            for (let p = k; p < m; p++) cells[p]!.del = true

            for (let p = j; p < k; p++) {
              cells[p]!.code = true
              cells[p]!.style.mono = true
            }

            i = m
            closed = true
            break
          }

          k = m
          continue
        }

        k++
      }

      // Unclosed run: it's literal text, so resume after it.
      if (!closed)
        i = j
    }
    else {
      i++
    }
  }
}

// `strong` is the 2-char style, `em` the 1-char style (undefined for ~~, which
// only matches in pairs). Closers consume from the front of their run and
// openers from the back, so one run can close earlier emphasis and open new.
function resolveEmphasis(cells: MdCell[], ch: string, strong: EmFlag, em: EmFlag | undefined, pairsOnly: boolean): void {
  const n = cells.length

  interface Run { start: number, end: number, len: number, openConsumed: number, closeConsumed: number, canOpen: boolean, canClose: boolean }

  const runs: Run[] = []
  let i = 0

  while (i < n) {
    if (cells[i]!.ch === ch && !cells[i]!.del && !cells[i]!.code) {
      let j = i

      while (j < n && cells[j]!.ch === ch && !cells[j]!.del && !cells[j]!.code) j++

      runs.push({ start: i, end: j, len: j - i, openConsumed: 0, closeConsumed: 0, canOpen: false, canClose: false })
      i = j
    }
    else {
      i++
    }
  }

  // CommonMark's flanking rules.
  for (const r of runs) {
    const before = r.start > 0 ? cells[r.start - 1]!.ch : undefined
    const after = r.end < n ? cells[r.end]!.ch : undefined
    const leftFlank = !isWS(after) && (!isPunct(after) || isWS(before) || isPunct(before))
    const rightFlank = !isWS(before) && (!isPunct(before) || isWS(after) || isPunct(after))

    // Underscores are stricter, which is what keeps snake_case intact.
    if (ch === '_') {
      r.canOpen = leftFlank && (!rightFlank || isPunct(before))
      r.canClose = rightFlank && (!leftFlank || isPunct(after))
    }
    else {
      r.canOpen = leftFlank
      r.canClose = rightFlank
    }
  }

  const stack: number[] = []
  for (let ri = 0; ri < runs.length; ri++) {
    const r = runs[ri]!
    if (r.canClose) {
      let avail = r.len - r.closeConsumed
      while (avail > 0 && stack.length) {
        const o = runs[stack[stack.length - 1]!]!
        const oAvail = o.len - o.openConsumed - o.closeConsumed
        if (oAvail <= 0) {
          stack.pop()
          continue
        }
        let use: number
        if (pairsOnly) {
          if (oAvail >= 2 && avail >= 2)
            use = 2
          else
            break
        }
        else {
          use = (oAvail >= 2 && avail >= 2) ? 2 : 1
        }
        for (let p = o.end - o.openConsumed - use; p < o.end - o.openConsumed; p++) cells[p]!.del = true
        for (let p = r.start + r.closeConsumed; p < r.start + r.closeConsumed + use; p++) cells[p]!.del = true
        const flag = use === 2 ? strong : em!
        for (let p = o.end; p < r.start; p++) {
          if (!cells[p]!.code)
            cells[p]!.style[flag] = true
        }
        o.openConsumed += use
        r.closeConsumed += use
        avail -= use
        if (o.len - o.openConsumed - o.closeConsumed <= 0)
          stack.pop()
      }
    }
    if (r.canOpen && (r.len - r.openConsumed - r.closeConsumed) > 0)
      stack.push(ri)
  }
}

// Mutates in place: markers get del, content gets the style.
export function resolveInlineMarkdown(cells: MdCell[]): void {
  resolveCodeSpans(cells)
  resolveEmphasis(cells, '*', 'bold', 'italic', false)
  resolveEmphasis(cells, '_', 'underline', 'italic', false)
  resolveEmphasis(cells, '~', 'strike', undefined, true)
}

// Composer markdown to an IRC wire string: markers become control codes and
// existing codes, like a colour from the picker, pass through. Convert one line
// at a time, since emphasis doesn't carry across the per-line PRIVMSGs of a
// multiline send.
const MD_TOGGLES: [EmFlag, string][] = [
  ['bold', String.fromCharCode(0x02)],
  ['italic', String.fromCharCode(0x1D)],
  ['underline', String.fromCharCode(0x1F)],
  ['strike', String.fromCharCode(0x1E)],
  ['mono', String.fromCharCode(0x11)],
]
export function markdownToIrc(text: string): string {
  return text.split('\n').map(markdownLineToIrc).join('\n')
}
function markdownLineToIrc(line: string): string {
  interface WireCell extends MdCell { ctrl: boolean }
  const cells: WireCell[] = []
  const push = (ch: string, ctrl: boolean): void => void cells.push({ ch, ctrl, style: {}, del: false, code: false })
  const chars = [...line]
  let i = 0
  while (i < chars.length) {
    const ch = chars[i]!
    if (ch.charCodeAt(0) === 0x03) {
      // The whole colour run passes through as one, or an emphasis toggle could
      // split \x03 from its digits and turn \x0308 into a reset plus a literal "08".
      push(ch, true)
      i++

      for (let d = 0; d < 2 && i < chars.length && /\d/.test(chars[i]!); d++, i++)
        push(chars[i]!, true)

      if (i < chars.length && chars[i] === ',') {
        push(',', true)
        i++

        for (let b = 0; b < 2 && i < chars.length && /\d/.test(chars[i]!); b++, i++)
          push(chars[i]!, true)
      }
      continue
    }

    // Other C0 chars are existing IRC codes. Keep them out of markdown scanning.
    push(ch, ch.charCodeAt(0) < 0x20)
    i++
  }
  resolveInlineMarkdown(cells.filter(c => !c.ctrl))
  let out = ''
  const open: Partial<Record<EmFlag, boolean>> = {}
  for (const c of cells) {
    if (c.ctrl) {
      out += c.ch
      continue
    }
    if (c.del)
      continue

    for (const [flag, code] of MD_TOGGLES) {
      if (!!c.style[flag] !== !!open[flag]) {
        out += code
        open[flag] = !!c.style[flag]
      }
    }
    out += c.ch
  }

  // Close unclosed markdown so a trailing format doesn't bleed.
  for (const [flag, code] of MD_TOGGLES) {
    if (open[flag])
      out += code
  }
  return out
}

// `strip` removes the markers (modern mode). Classic mode keeps them visible
// but still styles the content between them.
export function applyMarkdown(segs: Segment[], strip = true): Segment[] {
  // Per-character cells, so marker detection runs on plain text but keeps the
  // control-code styling.
  interface Cell { ch: string, style: StyleFlags, del: boolean, code: boolean }
  const cells: Cell[] = []
  for (const seg of segs) {
    const { value, type: _t, ...style } = seg
    for (const ch of value)
      cells.push({ ch, style: { ...style }, del: false, code: false })
  }
  if (!cells.length)
    return segs

  resolveInlineMarkdown(cells)

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
// The composer's contenteditable must keep every source character in the DOM,
// codes and markers included, so DOM text length stays 1:1 with the wire string
// and caret offsets map directly. Formatting characters become `hidden` tokens
// that render zero-width.

export interface EditorToken {
  text: string
  hidden: boolean
  style: StyleFlags
}

// `strip` works as in applyMarkdown. Control codes are always hidden.
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

  while (i < text.length) {
    const code = text.charCodeAt(i)

    if (code === 0x03) {
      pushHidden(text.charAt(i++))

      // Colour is `<fg>[,<bg>]`, one or two digits each. The digits are hidden
      // but still read.
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

      // A bare 0x03 with no digits clears colour instead of setting it.
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

  // The same cell objects, so resolveInlineMarkdown's mutations land in `cells`.
  const vis: MdCell[] = []
  for (const cell of cells) {
    if (!cell.hidden)
      vis.push(cell)
  }
  resolveInlineMarkdown(vis)

  const tokens: EditorToken[] = []
  let cur: EditorToken | null = null
  for (const cell of cells) {
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
