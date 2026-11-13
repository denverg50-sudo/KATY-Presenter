import { findBook, bookName } from './books'

export interface VerseRef {
  c: number
  v: number | null // null = whole chapter
}

export interface ScriptureRef {
  book: number
  ranges: { from: VerseRef; to: VerseRef }[]
}

const before = (a: VerseRef, b: VerseRef): boolean =>
  a.c < b.c || (a.c === b.c && (a.v ?? 0) < (b.v ?? 0))

function parsePart(s: string): { n1: number; n2?: number } | null {
  const m = s.match(/^(\d+)(?::(\d+))?$/)
  if (!m) return null
  return { n1: Number(m[1]), n2: m[2] !== undefined ? Number(m[2]) : undefined }
}

export function parseReference(text: string): ScriptureRef | { error: string } {
  const cleaned = text.replace(/[–—]/g, '-').replace(/\./g, ' ').replace(/\s+/g, ' ').trim()
  const m = cleaned.match(/^((?:[1-3]\s?)?[A-Za-z][A-Za-z ]*)(.*)$/)
  const bookText = m ? m[1].trim() : ''
  const book = bookText ? findBook(bookText) : null
  if (!m || book === null) return { error: `Unknown book "${bookText || cleaned}"` }

  const rest = m[2]
    .trim()
    .replace(/\s*([:,-])\s*/g, '$1')
    .replace(/(\d)\s+(?=\d)/g, '$1:')
  if (!rest) return { error: `Add a chapter, e.g. ${bookName(book)} 3` }

  const ranges: ScriptureRef['ranges'] = []
  let cur: number | null = null // chapter context for bare verse numbers
  for (const seg of rest.split(',')) {
    const pieces = seg.split('-')
    const a = pieces.length <= 2 ? parsePart(pieces[0]) : null
    const b = pieces.length === 2 ? parsePart(pieces[1]) : null
    if (!a || (pieces.length === 2 && !b)) return { error: `Couldn't read "${seg}"` }

    let from: VerseRef
    if (a.n2 !== undefined) from = { c: a.n1, v: a.n2 }
    else if (cur !== null) from = { c: cur, v: a.n1 }
    else from = { c: a.n1, v: null }

    let to = from
    if (b) {
      if (b.n2 !== undefined) to = { c: b.n1, v: b.n2 }
      else if (from.v !== null) to = { c: from.c, v: b.n1 }
      else to = { c: b.n1, v: null }
    }
    if (from.c < 1 || to.c < 1 || from.v === 0 || to.v === 0) {
      return { error: `Chapters and verses start at 1` }
    }
    if (before(to, from)) {
      return { error: `"${bookName(book)} ${seg}" runs backwards` }
    }
    ranges.push({ from, to })
    cur = to.v !== null ? to.c : null
  }
  return { book, ranges }
}

export function formatReference(ref: ScriptureRef): string {
  const parts: string[] = []
  let prev: VerseRef | null = null
  for (const { from, to } of ref.ranges) {
    const short = prev !== null && prev.v !== null && from.v !== null && prev.c === from.c
    const start = from.v === null ? `${from.c}` : short ? `${from.v}` : `${from.c}:${from.v}`
    let s = start
    if (to.c !== from.c || to.v !== from.v) {
      if (to.v === null) s += `–${to.c}`
      else if (to.c === from.c) s += `–${to.v}`
      else s += `–${to.c}:${to.v}`
    }
    parts.push(s)
    prev = to
  }
  return `${bookName(ref.book)} ${parts.join(', ')}`
}
