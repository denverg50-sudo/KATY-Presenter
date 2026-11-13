import { describe, expect, it } from 'vitest'
import { assembleSong, normalizeTitle, sectionNameFromCode, type RawSection } from './songImport'
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

describe('normalizeTitle', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeTitle('  Amazing   Grace! ')).toBe(normalizeTitle('amazing grace'))
  })
})

describe('sectionNameFromCode', () => {
  it('maps codes', () => {
    expect(sectionNameFromCode('v1')).toBe('Verse 1')
    expect(sectionNameFromCode('c')).toBe('Chorus')
    expect(sectionNameFromCode('c2')).toBe('Chorus 2')
    expect(sectionNameFromCode('p')).toBe('Pre-Chorus')
    expect(sectionNameFromCode('x9')).toBe('X9')
  })
})
