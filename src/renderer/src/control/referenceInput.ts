import { BOOKS } from '@shared/books'
import { formatReference, parseReference, queryWords, wordStartRegExp, type ScriptureRef } from '@shared/scripture'

/** What the reference box shows while the operator types. */
export type ReferenceReading =
  | { state: 'empty' }
  /** Not finished yet (trailing separator, book still ambiguous, no chapter). `last` is the last complete reference. */
  | { state: 'partial'; hint: string; last: string | null; lastCount: number | null }
  | { state: 'ok'; ref: ScriptureRef; formatted: string; count: number | null }
  | { state: 'error'; error: string }

const norm = (s: string): string => s.toLowerCase().replace(/[.\s]+/g, '')
const BOOK_KEYS = BOOKS.flatMap((b) => [b.name, b.osis, ...b.aliases].map(norm))

/** Verse count straight from the reference when every range stays inside one chapter; otherwise null. */
export function countVerses(ref: ScriptureRef): number | null {
  let n = 0
  for (const { from, to } of ref.ranges) {
    if (from.v === null || to.v === null || from.c !== to.c) return null
    n += to.v - from.v + 1
  }
  return n
}

const KEEP_TYPING = 'Keep typing…'

export function readReference(text: string): ReferenceReading {
  const t = text.trim()
  if (!t) return { state: 'empty' }

  // "Rom 8:28,", "Ps 23:", "John 3:16-": read what's there and wait for more
  const trailing = t.match(/^(.*?)[\s:,\-–—]+$/)
  if (trailing) {
    const head = readReference(trailing[1])
    if (head.state === 'ok') return { state: 'partial', hint: KEEP_TYPING, last: head.formatted, lastCount: head.count }
    if (head.state === 'empty') return { state: 'partial', hint: KEEP_TYPING, last: null, lastCount: null }
    return head
  }

  // "1", "2 " – a numbered book is coming
  if (/^[1-3]$/.test(t)) return { state: 'partial', hint: KEEP_TYPING, last: null, lastCount: null }

  const parsed = parseReference(t)
  if ('error' in parsed) {
    if (parsed.error.startsWith('Add a chapter')) return { state: 'partial', hint: parsed.error, last: null, lastCount: null }
    // A book name still being typed ("Jo", "1 Co") – only letters so far and it starts some book's name
    const letters = t.match(/^((?:[1-3]\s?)?[A-Za-z][A-Za-z .]*)$/)
    if (parsed.error.startsWith('Unknown book') && letters) {
      const key = norm(letters[1])
      if (BOOK_KEYS.some((k) => k.startsWith(key))) return { state: 'partial', hint: KEEP_TYPING, last: null, lastCount: null }
    }
    return { state: 'error', error: parsed.error }
  }
  return { state: 'ok', ref: parsed, formatted: formatReference(parsed), count: countVerses(parsed) }
}

/** The reference to use for Enter / Add / Go live: a complete one, or the last complete one while typing on. */
export function usableReference(r: ReferenceReading): string | null {
  return r.state === 'ok' ? r.formatted : r.state === 'partial' ? r.last : null
}

/** About 60 characters of a verse around the first word-start match of any query word (same rule as the search). */
export function snippet(text: string, query: string, length = 60): { text: string; start: boolean; end: boolean } {
  const words = queryWords(query)
  const at = words.length ? Math.max(0, text.search(wordStartRegExp(words))) : 0
  const from = Math.max(0, Math.min(at - 20, text.length - length))
  const to = Math.min(text.length, from + length)
  return { text: text.slice(from, to), start: from > 0, end: to < text.length }
}

/** Split text into plain and matched pieces for highlighting: query words at the start of a word, case-insensitive. */
export function highlight(text: string, query: string): { s: string; hit: boolean }[] {
  const words = queryWords(query)
  if (!words.length) return [{ s: text, hit: false }]
  const out: { s: string; hit: boolean }[] = []
  let pos = 0
  for (const m of text.matchAll(wordStartRegExp(words, 'giu'))) {
    if (m.index > pos) out.push({ s: text.slice(pos, m.index), hit: false })
    out.push({ s: m[0], hit: true })
    pos = m.index + m[0].length
  }
  if (pos < text.length) out.push({ s: text.slice(pos), hit: false })
  return out
}
