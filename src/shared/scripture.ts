import { findBook, bookName, isSingleChapter } from './books'
import type { Slide } from './lyrics'
import type { Bible, Passage, PassageVerse } from './types'

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

  // One-chapter books: "Jude 3" / "Jude 24-25" are verses of chapter 1; "Jude 1" alone is the whole book
  const single = isSingleChapter(book)
  if (single && rest === '1') return { book, ranges: [{ from: { c: 1, v: null }, to: { c: 1, v: null } }] }

  const ranges: ScriptureRef['ranges'] = []
  let cur: number | null = single ? 1 : null // chapter context for bare verse numbers
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
    cur = single ? 1 : to.v !== null ? to.c : null
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

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export const VERSE_MARK = (n: number): string => `⟦${n}⟧`

export function getPassage(bible: Bible, ref: ScriptureRef): Passage | { error: string } {
  const name = bookName(ref.book)
  const book = bible.books.find((b) => b.num === ref.book)
  if (!book) return { error: `${bible.abbrev} doesn't contain ${name}` }

  const verses: PassageVerse[] = []
  const nChapters = book.chapters.length
  for (const [range, { from, to }] of ref.ranges.entries()) {
    for (const c of [from.c, to.c]) {
      if (c > nChapters) return { error: `${name} has ${plural(nChapters, 'chapter')}` }
    }
    for (let c = from.c; c <= to.c; c++) {
      const texts = book.chapters[c - 1]
      if (!texts || texts.length === 0) return { error: `${bible.abbrev} doesn't contain ${name} ${c}` }
      const first = c === from.c && from.v !== null ? from.v : 1
      const last = c === to.c && to.v !== null ? to.v : texts.length
      if (first > texts.length || last > texts.length) {
        return { error: `${name} ${c} has ${plural(texts.length, 'verse')}` }
      }
      for (let v = first; v <= last; v++) {
        verses.push({ book: ref.book, c, v, text: texts[v - 1], range })
      }
    }
  }
  return { bibleId: bible.id, abbrev: bible.abbrev, reference: formatReference(ref), verses }
}

export interface ScriptureSlide extends Slide {
  footer: string
}

/** The passage's verses split into slides. Verses are grouped by the range they came from, so separate ranges never share a slide. */
export function slideChunks(p: Passage, versesPerSlide: 1 | 2 | 3): PassageVerse[][] {
  const runs: PassageVerse[][] = []
  for (const verse of p.verses) {
    const run = runs[runs.length - 1]
    const prev = run?.[run.length - 1]
    if (run && prev !== undefined && prev.range === verse.range) run.push(verse)
    else runs.push([verse])
  }
  const chunks: PassageVerse[][] = []
  for (const run of runs) for (let i = 0; i < run.length; i += versesPerSlide) chunks.push(run.slice(i, i + versesPerSlide))
  return chunks
}

export function buildScriptureSlides(
  p: Passage,
  versesPerSlide: 1 | 2 | 3,
  showVerseNumbers: boolean
): ScriptureSlide[] {
  return slideChunks(p, versesPerSlide).map((chunk, i) => {
    const a = chunk[0]
    const b = chunk[chunk.length - 1]
    const full = formatReference({
      book: a.book,
      ranges: [{ from: { c: a.c, v: a.v }, to: { c: b.c, v: b.v } }]
    })
    return {
      key: `s${i}`,
      label: full.slice(bookName(a.book).length + 1),
      text: chunk.map((v) => (showVerseNumbers ? `${VERSE_MARK(v.v)} ${v.text}` : v.text)).join(' '),
      footer: `${full} · ${p.abbrev}`
    }
  })
}

/**
 * Where slide `index` of one layout lands in another (other verses per slide and/or translation):
 * the new slide holding the first verse that was showing. Falls back to the same verse position, clamped.
 */
export function mapSlideIndex(
  from: { passage: Passage; versesPerSlide: 1 | 2 | 3 },
  index: number,
  to: { passage: Passage; versesPerSlide: 1 | 2 | 3 }
): number {
  const toChunks = slideChunks(to.passage, to.versesPerSlide)
  if (!toChunks.length) return 0
  const fromChunks = slideChunks(from.passage, from.versesPerSlide)
  const first = fromChunks[Math.max(0, Math.min(index, fromChunks.length - 1))]?.[0]
  if (!first) return Math.max(0, Math.min(index, toChunks.length - 1))
  const same = (v: PassageVerse): boolean => v.book === first.book && v.c === first.c && v.v === first.v
  let at = toChunks.findIndex((chunk) => chunk.some(same))
  if (at < 0) {
    // Not in the other translation: use the verse's position in the passage instead
    const pos = from.passage.verses.indexOf(first)
    const target = to.passage.verses[Math.min(pos, to.passage.verses.length - 1)]
    at = toChunks.findIndex((chunk) => chunk.includes(target))
  }
  return Math.max(0, at)
}

export function searchBible(bible: Bible, query: string, limit = 200): PassageVerse[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const out: PassageVerse[] = []
  for (const book of bible.books) {
    for (let c = 0; c < book.chapters.length; c++) {
      for (let v = 0; v < book.chapters[c].length; v++) {
        const text = book.chapters[c][v]
        const lower = text.toLowerCase()
        if (words.every((w) => lower.includes(w))) {
          out.push({ book: book.num, c: c + 1, v: v + 1, text })
          if (out.length >= limit) return out
        }
      }
    }
  }
  return out
}
