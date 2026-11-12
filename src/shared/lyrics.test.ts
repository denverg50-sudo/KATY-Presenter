import { describe, it, expect } from 'vitest'
import { parseLyrics, buildSlides, abbreviate, sectionsToLyrics, rechunk } from './lyrics'

const raw = `[Verse 1]
Amazing grace how sweet the sound
That saved a wretch like me

I once was lost but now am found
Was blind but now I see

[Chorus]
My chains are gone

[Pre-Chorus]
Line one`

describe('parseLyrics', () => {
  it('splits sections on [tags] and slides on blank lines', () => {
    const s = parseLyrics(raw)
    expect(s.map((x) => x.label)).toEqual(['Verse 1', 'Chorus', 'Pre-Chorus'])
    expect(s[0].slides).toEqual([
      'Amazing grace how sweet the sound\nThat saved a wretch like me',
      'I once was lost but now am found\nWas blind but now I see'
    ])
    expect(s[1].slides).toEqual(['My chains are gone'])
  })

  it('handles lyrics with no tags', () => {
    const s = parseLyrics('a\nb\n\n\n c \n')
    expect(s).toHaveLength(1)
    expect(s[0].label).toBe('')
    expect(s[0].slides).toEqual(['a\nb', 'c'])
  })

  it('ignores empty input and Windows line endings', () => {
    expect(parseLyrics('   ')).toEqual([])
    expect(parseLyrics('[Chorus]\r\nx\r\n\r\ny')[0].slides).toEqual(['x', 'y'])
  })

  it('drops tags with no lines', () => {
    expect(parseLyrics('[Intro]\n[Verse]\nhi').map((s) => s.label)).toEqual(['Verse'])
  })
})

describe('abbreviate', () => {
  it('makes short codes', () => {
    expect(abbreviate('Verse 1')).toBe('V1')
    expect(abbreviate('Chorus')).toBe('C')
    expect(abbreviate('Pre-Chorus')).toBe('PC')
    expect(abbreviate('Verse 12')).toBe('V12')
  })
})

describe('buildSlides', () => {
  it('uses written order when no arrangement', () => {
    const slides = buildSlides(raw, '')
    expect(slides.map((s) => s.label)).toEqual(['Verse 1', 'Verse 1', 'Chorus', 'Pre-Chorus'])
    expect(slides[1].text).toContain('I once was lost')
  })

  it('follows the arrangement using codes or full names, case-insensitive', () => {
    const slides = buildSlides(raw, 'v1 C chorus Bogus')
    expect(slides.map((s) => s.label)).toEqual(['Verse 1', 'Verse 1', 'Chorus', 'Chorus'])
  })

  it('falls back to written order when arrangement matches nothing', () => {
    expect(buildSlides(raw, 'X Y')).toHaveLength(4)
  })

  it('gives each slide a stable unique key', () => {
    const keys = buildSlides(raw, 'C C').map((s) => s.key)
    expect(new Set(keys).size).toBe(2)
  })
})

describe('sectionsToLyrics', () => {
  it('round-trips', () => {
    expect(parseLyrics(sectionsToLyrics(parseLyrics(raw)))).toEqual(parseLyrics(raw))
  })
})

describe('rechunk', () => {
  it('re-splits every section into N-line slides, keeping tags', () => {
    const out = rechunk('[Verse 1]\na\nb\nc\n\nd\n[Chorus]\ne\nf', 2)
    expect(parseLyrics(out)).toEqual([
      { label: 'Verse 1', slides: ['a\nb', 'c\nd'] },
      { label: 'Chorus', slides: ['e\nf'] }
    ])
  })
})
