import type { SongImportItem } from './types'
import { abbreviate, sectionsToLyrics, type Section } from './lyrics'

export interface RawSection {
  /** null means the section is ungrouped */
  name: string | null
  slides: string[]
}

export interface ImportedSong {
  title: string
  author: string
  ccli: string
  copyright: string
  lyrics: string
  arrangement: string
  source: string
  category: string | null
  notes: string[]
  file: string
}

const TAG_LINE = /^\[[^\]]+\]$/

/** Trim lines, drop empty lines, and neutralise lines that would be read as a `[Tag]`. */
function cleanSlide(text: string, onBracket: () => void): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      if (!TAG_LINE.test(l)) return l
      onBracket()
      return `(${l.slice(1, -1)})`
    })
    .join('\n')
}

/** Labels must survive `[Label]` parsing and arrangement splitting. */
function cleanLabel(name: string | null): string | null {
  if (name === null) return null
  const label = name.replace(/[[\],]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!label) return null
  return abbreviate(label) ? label : 'Section'
}

export function assembleSong(
  sections: RawSection[],
  order: number[]
): { lyrics: string; arrangement: string; notes: string[] } {
  let blanks = 0
  let bracketed = 0
  const cleaned = sections.map((s) => {
    const slides: string[] = []
    for (const raw of s.slides) {
      const c = cleanSlide(raw, () => bracketed++)
      if (c) slides.push(c)
      else blanks++
    }
    return { name: cleanLabel(s.name), slides }
  })

  const valid = (i: number): boolean => Number.isInteger(i) && !!cleaned[i] && cleaned[i].slides.length > 0
  const written = cleaned.map((_, i) => i).filter(valid)
  const ignored = order.filter((i) => !valid(i)).length
  let play = order.filter(valid)
  let fellBack = false
  if (!order.length) play = written
  else if (!play.length) {
    play = written
    fellBack = true
  }
  const firsts = [...new Set(play)]

  // number duplicated names, in order of first appearance
  const counts = new Map<string, number>()
  for (const i of firsts) {
    const n = cleaned[i].name
    if (n) counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  let slideNo = 0
  const labels = new Map<number, string>()
  for (const i of firsts) {
    const n = cleaned[i].name
    if (n === null) {
      labels.set(i, `Slide ${++slideNo}`)
    } else if ((counts.get(n.toLowerCase()) ?? 0) > 1) {
      const k = (seen.get(n.toLowerCase()) ?? 0) + 1
      seen.set(n.toLowerCase(), k)
      labels.set(i, `${n} ${k}`)
    } else {
      labels.set(i, n)
    }
  }

  // make every label and abbreviation unique (case-insensitive)
  const usedLabels = new Set<string>()
  const usedAbbrs = new Set<string>()
  const finalSections: Section[] = []
  const abbrOf = new Map<number, string>()
  for (const i of firsts) {
    const base = labels.get(i)!
    let label = base
    let n = 1
    const clash = (l: string): boolean => {
      const a = abbreviate(l).toLowerCase()
      const ll = l.toLowerCase()
      return usedLabels.has(ll) || usedAbbrs.has(ll) || usedLabels.has(a) || usedAbbrs.has(a)
    }
    while (clash(label)) label = `${base} ${++n}`
    usedLabels.add(label.toLowerCase())
    usedAbbrs.add(abbreviate(label).toLowerCase())
    abbrOf.set(i, abbreviate(label))
    finalSections.push({ label, slides: cleaned[i].slides })
  }

  const repeats = play.length !== firsts.length
  const notes: string[] = []
  if (blanks) notes.push(`${blanks} blank slide${blanks === 1 ? '' : 's'} left out`)
  if (bracketed) {
    notes.push(`${bracketed} line${bracketed === 1 ? '' : 's'} in [brackets] changed to (brackets)`)
  }
  if (fellBack) notes.push("Play order didn't match any lyrics; used the written order")
  else {
    if (ignored) notes.push(`${ignored} play-order ${ignored === 1 ? 'entry' : 'entries'} ignored`)
    const omitted = written.filter((i) => !firsts.includes(i)).length
    if (omitted) notes.push(`${omitted} section${omitted === 1 ? '' : 's'} not in the play order left out`)
  }
  return {
    lyrics: sectionsToLyrics(finalSections),
    arrangement: repeats ? play.map((i) => abbrOf.get(i)!).join(' ') : '',
    notes
  }
}

export function normalizeTitle(t: string): string {
  return t
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const CODE_NAMES: Record<string, string> = {
  v: 'Verse',
  c: 'Chorus',
  b: 'Bridge',
  p: 'Pre-Chorus',
  e: 'Ending',
  i: 'Intro',
  o: 'Other',
  t: 'Tag'
}

export function sectionNameFromCode(code: string): string {
  const c = code.trim()
  const m = c.match(/^([a-z])(\d*)$/i)
  const name = m && CODE_NAMES[m[1].toLowerCase()]
  if (!name) return c.toUpperCase()
  return m[2] ? `${name} ${m[2]}` : name
}

/**
 * Decide which preview items to import. FreeShow items follow their ticked category
 * (null = the "(none)" bucket); items from other sources are always kept. Library
 * duplicates and repeats of an earlier kept title go into `duplicates`; FreeShow items
 * left out only because their category is unticked go into `unticked`.
 */
export function selectForImport(
  items: SongImportItem[],
  tickedCategories: Set<string | null>
): { importKeys: string[]; duplicates: SongImportItem[]; unticked: SongImportItem[] } {
  const importKeys: string[] = []
  const duplicates: SongImportItem[] = []
  const unticked: SongImportItem[] = []
  const seen = new Set<string>()
  for (const it of items) {
    const ticked = it.source !== 'FreeShow' || tickedCategories.has(it.category)
    if (!ticked) {
      unticked.push(it)
      continue
    }
    const norm = normalizeTitle(it.title)
    if (it.libraryDuplicate || seen.has(norm)) {
      duplicates.push(it)
      continue
    }
    seen.add(norm)
    importKeys.push(it.key)
  }
  return { importKeys, duplicates, unticked }
}

/**
 * FreeShow categories ticked by default: everything, including null ("(none)"), except
 * known non-song values: `info`, `presentation`, or anything mentioning announcements,
 * sermons, scripture, the Bible or notices.
 */
export function defaultTicked(category: string | null): boolean {
  if (category === null) return true
  const c = category.trim().toLowerCase()
  if (c === 'info' || c === 'presentation') return false
  return !/announce|sermon|scripture|bible|notice/.test(c)
}

const BUILT_IN_CATEGORIES = new Set(['song', 'info', 'presentation'])

/** How a FreeShow category is shown: built-in ids capitalised, generated ids shortened, others raw. */
export function categoryLabel(category: string | null): string {
  if (category === null) return '(none)'
  if (BUILT_IN_CATEGORIES.has(category.toLowerCase())) return category.charAt(0).toUpperCase() + category.slice(1)
  if (!/\s/.test(category) && category.length >= 8 && /\p{L}/u.test(category) && /\d/.test(category)) {
    return `Custom category (${category.slice(0, 6)}…)`
  }
  return category
}

/** "FreeShow 487 · Text 1": selected items counted by source, in order of first appearance. */
export function sourceSummary(items: SongImportItem[], keys: string[]): string {
  const wanted = new Set(keys)
  const counts = new Map<string, number>()
  for (const it of items) if (wanted.has(it.key)) counts.set(it.source, (counts.get(it.source) ?? 0) + 1)
  return [...counts].map(([s, k]) => `${s} ${k.toLocaleString('en-US')}`).join(' · ')
}
