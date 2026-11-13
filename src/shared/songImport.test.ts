import { describe, expect, it } from 'vitest'
import {
  assembleSong,
  categoryLabel,
  defaultTicked,
  normalizeTitle,
  sectionNameFromCode,
  selectForImport,
  sourceSummary,
  type RawSection
} from './songImport'
import { buildSlides } from './lyrics'

function roundTrip(sections: RawSection[], order: number[]): string[] {
  const { lyrics, arrangement } = assembleSong(sections, order)
  return buildSlides(lyrics, arrangement).map((s) => s.text)
}

const verse1: RawSection = { name: 'Verse', slides: ['Amazing grace how sweet', 'That saved a wretch'] }
const verse2: RawSection = { name: 'Verse', slides: ["Twas grace that taught"] }
const chorus: RawSection = { name: 'Chorus', slides: ['Oh sing it out'] }

describe('assembleSong', () => {
  it('numbers duplicate names and builds the arrangement', () => {
    const r = assembleSong([verse1, verse2, chorus], [0, 1, 2, 1])
    expect(r.lyrics).toContain('[Verse 1]')
    expect(r.lyrics).toContain('[Verse 2]')
    expect(r.lyrics).toContain('[Chorus]')
    expect(r.arrangement).toBe('V1 V2 C V2')
  })

  it('orders lyrics by first appearance', () => {
    const r = assembleSong([verse1, verse2, chorus], [0, 2, 1, 2])
    expect(r.lyrics.indexOf('[Verse 1]')).toBeLessThan(r.lyrics.indexOf('[Chorus]'))
    expect(r.lyrics.indexOf('[Chorus]')).toBeLessThan(r.lyrics.indexOf('[Verse 2]'))
    expect(r.arrangement).toBe('V1 C V2 C')
  })

  it('makes abbreviations unique', () => {
    const s: RawSection[] = [
      { name: 'Pre-Chorus', slides: ['a'] },
      { name: 'Post-Chorus', slides: ['b'] }
    ]
    const r = assembleSong(s, [])
    expect(r.lyrics).toContain('[Post-Chorus 2]')
    expect(r.arrangement).toBe('')
    expect(roundTrip(s, [1, 0, 1])).toEqual(['b', 'a', 'b'])
  })

  it('names null sections Slide n', () => {
    const r = assembleSong([{ name: null, slides: ['x'] }, { name: null, slides: ['y'] }], [])
    expect(r.lyrics).toContain('[Slide 1]')
    expect(r.lyrics).toContain('[Slide 2]')
  })

  it('counts blank slides', () => {
    expect(assembleSong([{ name: 'A', slides: ['x', '  '] }], []).notes).toEqual(['1 blank slide left out'])
    expect(assembleSong([{ name: 'A', slides: ['x', '', ' ', '\n'] }], []).notes).toEqual([
      '3 blank slides left out'
    ])
    expect(assembleSong([{ name: 'A', slides: ['x'] }], []).notes).toEqual([])
  })

  it('drops empty sections and ignores their order entries', () => {
    const r = assembleSong([{ name: 'A', slides: [' '] }, chorus], [0, 1])
    expect(r.lyrics).toBe('[Chorus]\nOh sing it out')
    expect(r.arrangement).toBe('')
  })

  it('uses written order when order is empty, and "" arrangement', () => {
    const r = assembleSong([verse1, chorus], [])
    expect(r.arrangement).toBe('')
    expect(r.lyrics.startsWith('[Verse]')).toBe(true)
  })

  it('round-trips with repeats', () => {
    const s = [verse1, verse2, chorus]
    const order = [0, 2, 1, 2]
    const expected = order.flatMap((i) => s[i].slides)
    expect(roundTrip(s, order)).toEqual(expected)
  })

  it('round-trips with hostile labels and lines', () => {
    const s: RawSection[] = [
      { name: 'Verse 1', slides: ['one'] },
      { name: 'V1', slides: ['two'] },
      { name: 'Bridge [x]', slides: ['[Chorus]\nthree'] },
      { name: 'Chorus, a', slides: ['line one\n\nline two'] },
      { name: '-', slides: ['four'] },
      { name: 'Verse 1', slides: ['five'] }
    ]
    const order = [0, 1, 2, 3, 4, 5, 1, 0]
    const out = roundTrip(s, order)
    expect(out).toHaveLength(order.length)
    expect(out[0]).toBe('one')
    expect(out[1]).toBe('two')
    expect(out[2]).toBe('(Chorus)\nthree')
    expect(out[3]).toBe('line one\nline two')
    expect(out[4]).toBe('four')
    expect(out[5]).toBe('five')
    expect(out[6]).toBe('two')
    expect(out[7]).toBe('one')
  })
})

describe('assembleSong notes and fallbacks', () => {
  it('falls back to written order when no order entry is usable', () => {
    const s = [verse1, { name: 'Blank', slides: [' '] }, chorus]
    for (const order of [[9, -1], [1]]) {
      const r = assembleSong(s, order)
      expect(r.notes).toContain("Play order didn't match any lyrics; used the written order")
      expect(r.lyrics).toContain('[Verse]')
      expect(r.lyrics).toContain('[Chorus]')
    }
  })

  it('notes sections left out of the play order', () => {
    const r = assembleSong([verse1, chorus, verse2], [0])
    expect(r.notes).toEqual(['2 sections not in the play order left out'])
    expect(assembleSong([verse1, chorus], [0]).notes).toEqual(['1 section not in the play order left out'])
  })

  it('notes ignored order entries', () => {
    expect(assembleSong([verse1, chorus], [0, 5, 1]).notes).toEqual(['1 play-order entry ignored'])
    expect(assembleSong([verse1, chorus], [0, 5, 7, 1]).notes).toEqual(['2 play-order entries ignored'])
  })

  it('notes bracket lines changed', () => {
    const one = assembleSong([{ name: 'A', slides: ['[x]'] }], [])
    expect(one.notes).toEqual(['1 line in [brackets] changed to (brackets)'])
    const two = assembleSong([{ name: 'A', slides: ['[x]\n[y]'] }], [])
    expect(two.notes).toEqual(['2 lines in [brackets] changed to (brackets)'])
  })
})

describe('assembleSong extra round trips', () => {
  it('Chorus next to a section abbreviated C', () => {
    const s: RawSection[] = [
      { name: 'Chorus', slides: ['a'] },
      { name: 'C', slides: ['b'] }
    ]
    expect(roundTrip(s, [1, 0, 1])).toEqual(['b', 'a', 'b'])
  })
  it('case-differing duplicate names', () => {
    const s: RawSection[] = [
      { name: 'verse', slides: ['a'] },
      { name: 'Verse', slides: ['b'] }
    ]
    expect(roundTrip(s, [1, 0, 1])).toEqual(['b', 'a', 'b'])
  })
  it('reversed order, no repeats', () => {
    const s = [verse1, chorus]
    const r = assembleSong(s, [1, 0])
    expect(r.arrangement).toBe('')
    expect(roundTrip(s, [1, 0])).toEqual([...chorus.slides, ...verse1.slides])
  })
})

describe('normalizeTitle', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeTitle('  Amazing   Grace! ')).toBe(normalizeTitle('amazing grace'))
  })
  it('treats NFD and NFC accents as equal', () => {
    expect(normalizeTitle('Cre\u0301ation')).toBe(normalizeTitle('Cr\u00e9ation'))
    expect(normalizeTitle('Création')).not.toBe(normalizeTitle('Creation'))
  })
  it('keeps combining marks, so Devanagari vowel signs matter', () => {
    // कल (kal) vs काल (kaal): differ only by the vowel sign ा
    expect(normalizeTitle('\u0915\u0932')).not.toBe(normalizeTitle('\u0915\u093e\u0932'))
    expect(normalizeTitle('\u0915\u093e\u0932')).toBe('\u0915\u093e\u0932')
  })
})

describe('sectionNameFromCode', () => {
  it('maps codes', () => {
    expect(sectionNameFromCode('v1')).toBe('Verse 1')
    expect(sectionNameFromCode('c')).toBe('Chorus')
    expect(sectionNameFromCode('c2')).toBe('Chorus 2')
    expect(sectionNameFromCode('p')).toBe('Pre-Chorus')
    expect(sectionNameFromCode('x9')).toBe('X9')
    expect(sectionNameFromCode('')).toBe('')
  })
})

describe('defaultTicked', () => {
  it('ticks everything except known non-song categories', () => {
    expect(defaultTicked(null)).toBe(true)
    expect(defaultTicked('song')).toBe(true)
    expect(defaultTicked('Worship Songs')).toBe(true)
    expect(defaultTicked('Hymns')).toBe(true)
    expect(defaultTicked('k3j9x0a2b')).toBe(true)
    expect(defaultTicked('')).toBe(true)
    expect(defaultTicked('info')).toBe(false)
    expect(defaultTicked('Info')).toBe(false)
    expect(defaultTicked('presentation')).toBe(false)
    expect(defaultTicked('Announcements')).toBe(false)
    expect(defaultTicked('Sunday sermon')).toBe(false)
    expect(defaultTicked('SCRIPTURE')).toBe(false)
    expect(defaultTicked('Bible readings')).toBe(false)
    expect(defaultTicked('Notices')).toBe(false)
    expect(defaultTicked('information')).toBe(true)
  })
})

describe('categoryLabel', () => {
  it('capitalises built-ins, shortens generated ids, keeps others raw', () => {
    expect(categoryLabel(null)).toBe('(none)')
    expect(categoryLabel('song')).toBe('Song')
    expect(categoryLabel('info')).toBe('Info')
    expect(categoryLabel('presentation')).toBe('Presentation')
    expect(categoryLabel('k3j9x0a2b')).toBe('Custom category (k3j9x0…)')
    expect(categoryLabel('Hymns')).toBe('Hymns')
    expect(categoryLabel('Songs 2024')).toBe('Songs 2024')
    expect(categoryLabel('abc123')).toBe('abc123')
    expect(categoryLabel('abcdefghij')).toBe('abcdefghij')
    expect(categoryLabel('12345678')).toBe('12345678')
  })
})

describe('selectForImport / sourceSummary', () => {
  const mk = (key: string, title: string, source: string, category: string | null) => ({
    key, title, file: `${key}.f`, source, category, libraryDuplicate: false, notes: []
  })
  const items = [mk('a', 'One', 'FreeShow', 'song'), mk('b', 'Two', 'FreeShow', 'info'), mk('c', 'One', 'FreeShow', 'info'), mk('d', 'Three', 'Text', null)]
  it('lists items left out only because their category is unticked', () => {
    const sel = selectForImport(items, new Set<string | null>(['song']))
    expect(sel.importKeys).toEqual(['a', 'd'])
    expect(sel.unticked.map((i) => i.key)).toEqual(['b', 'c'])
    expect(sel.duplicates).toEqual([])
    expect(sel.importKeys.length + sel.unticked.length + sel.duplicates.length).toBe(items.length)
  })
  it('counts selected items by source', () => {
    expect(sourceSummary(items, ['a', 'b', 'd'])).toBe('FreeShow 2 · Text 1')
    expect(sourceSummary(items, [])).toBe('')
  })
})
