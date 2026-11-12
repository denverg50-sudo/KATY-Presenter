export interface Section {
  label: string
  slides: string[]
}

export interface Slide {
  key: string
  label: string
  text: string
}

const TAG = /^\s*\[([^\]]+)\]\s*$/

/** Split raw lyrics into sections. `[Name]` lines start a section, blank lines start a new slide. */
export function parseLyrics(raw: string): Section[] {
  const sections: Section[] = []
  let current: Section = { label: '', slides: [] }
  let buffer: string[] = []

  const flushSlide = (): void => {
    if (buffer.length) current.slides.push(buffer.join('\n'))
    buffer = []
  }
  const flushSection = (): void => {
    flushSlide()
    if (current.slides.length) sections.push(current)
  }

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const tag = line.match(TAG)
    if (tag) {
      flushSection()
      current = { label: tag[1].trim(), slides: [] }
    } else if (line.trim() === '') {
      flushSlide()
    } else {
      buffer.push(line.trim())
    }
  }
  flushSection()
  return sections
}

/** "Verse 1" -> "V1", "Pre-Chorus" -> "PC" */
export function abbreviate(label: string): string {
  return label
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
    .join('')
}

function findSection(sections: Section[], token: string): number {
  const t = token.toLowerCase()
  return sections.findIndex(
    (s) => s.label.toLowerCase() === t || abbreviate(s.label).toLowerCase() === t
  )
}

/** Turn lyrics + arrangement ("V1 C V2 C") into the ordered list of slides to show. */
export function buildSlides(raw: string, arrangement: string): Slide[] {
  const sections = parseLyrics(raw)
  let order = arrangement
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => findSection(sections, t))
    .filter((i) => i >= 0)
  if (!order.length) order = sections.map((_, i) => i)

  const slides: Slide[] = []
  order.forEach((sectionIndex, pos) => {
    const section = sections[sectionIndex]
    section.slides.forEach((text, i) => {
      slides.push({ key: `${pos}-${sectionIndex}-${i}`, label: section.label, text })
    })
  })
  return slides
}

export function sectionsToLyrics(sections: Section[]): string {
  return sections
    .map((s) => (s.label ? `[${s.label}]\n` : '') + s.slides.join('\n\n'))
    .join('\n\n')
}

/** Re-split each section into slides of `n` lines (handy after pasting lyrics with no blank lines). */
export function rechunk(raw: string, n: number): string {
  const size = Math.max(1, Math.floor(n))
  return sectionsToLyrics(
    parseLyrics(raw).map((s) => {
      const lines = s.slides.flatMap((x) => x.split('\n'))
      const slides: string[] = []
      for (let i = 0; i < lines.length; i += size) slides.push(lines.slice(i, i + size).join('\n'))
      return { label: s.label, slides }
    })
  )
}
