// Link, channel and mention detection for chat text. The message log and the
// three topic renderers all need the same rules, so they live here instead of
// being copy-pasted per component.

const URL_PATTERN = /https?:\/\/\S+/g

// A URL written in prose drags the sentence's punctuation along with it:
// "(https://rox.music)" or "see https://rox.music." Neither the paren nor the
// period belongs in the href.
const TRAILING_PUNCTUATION = '.,;:!?\'"'
const BRACKET_PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' }

function countChar(text: string, char: string): number {
  let count = 0
  for (const c of text) {
    if (c === char)
      count++
  }

  return count
}

// Strip the punctuation that rode along on the end of a matched URL.
export function trimUrl(raw: string): string {
  let url = raw

  while (url.length > 0) {
    const last = url.at(-1)!

    if (TRAILING_PUNCTUATION.includes(last)) {
      url = url.slice(0, -1)
      continue
    }

    // A closing bracket stays only if the URL opened it itself. Wikipedia links
    // carry balanced parens, a wrapping "(...)" does not.
    const opener = BRACKET_PAIRS[last]
    if (opener && countChar(url, opener) < countChar(url, last)) {
      url = url.slice(0, -1)
      continue
    }

    break
  }

  return url
}

export interface UrlMatch { index: number, value: string }

// URLs with their offset in the source text, punctuation already trimmed.
export function findUrls(text: string): UrlMatch[] {
  const out: UrlMatch[] = []
  for (const m of text.matchAll(URL_PATTERN))
    out.push({ index: m.index ?? 0, value: trimUrl(m[0]) })

  return out
}

export function urlsIn(text: string): string[] {
  return findUrls(text).map(u => u.value)
}

export function stripUrls(text: string): string {
  return text.replace(URL_PATTERN, '')
}

// Channel refs can't contain whitespace or commas, and the mention shape mirrors
// what the message log accepts so a nick highlights the same way in both places.
const TOPIC_TOKEN = /https?:\/\/\S+|#\w[^\s,]*|@[a-z\d][\w-]{0,31}/gi
const TRAILING_CHANNEL_PUNCTUATION = /[.,;:!?'")\]}>]+$/

export interface TopicSegment { type: 'text' | 'link' | 'channel' | 'mention', value: string }

// Split a channel topic into plain text plus the bits that are clickable.
export function topicSegments(topic: string): TopicSegment[] {
  const out: TopicSegment[] = []
  let last = 0

  for (const m of topic.matchAll(TOPIC_TOKEN)) {
    const idx = m.index ?? 0
    const raw = m[0]

    let type: TopicSegment['type'] = 'link'
    let value = trimUrl(raw)

    if (raw.startsWith('#')) {
      type = 'channel'
      value = raw.replace(TRAILING_CHANNEL_PUNCTUATION, '')
    }
    else if (raw.startsWith('@')) {
      type = 'mention'
      value = raw
    }

    // Trimming can eat the whole token ("#." and friends); leave it as text.
    if (value.length < 2)
      continue

    if (idx > last)
      out.push({ type: 'text', value: topic.slice(last, idx) })

    out.push({ type, value })
    last = idx + value.length
  }

  if (last < topic.length)
    out.push({ type: 'text', value: topic.slice(last) })

  return out
}
