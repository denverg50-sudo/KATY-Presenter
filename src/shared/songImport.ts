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
function cleanSlide(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (TAG_LINE.test(l) ? `(${l.slice(1, -1)})` : l))
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
  const cleaned = sections.map((s) => {
    const slides: string[] = []
    for (const raw of s.slides) {
      const c = cleanSlide(raw)
      if (c) slides.push(c)
      else blanks++
    }
    return { name: cleanLabel(s.name), slides }
  })

  const valid = (i: number): boolean => Number.isInteger(i) && !!cleaned[i] && cleaned[i].slides.length > 0
  const play = order.length ? order.filter(valid) : cleaned.map((_, i) => i).filter(valid)
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
  const notes = blanks ? [`${blanks} blank slide${blanks === 1 ? '' : 's'} left out`] : []
  return {
    lyrics: sectionsToLyrics(finalSections),
    arrangement: repeats ? play.map((i) => abbrOf.get(i)!).join(' ') : '',
    notes
  }
}

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
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
