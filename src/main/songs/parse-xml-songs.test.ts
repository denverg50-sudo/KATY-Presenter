import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSlides } from '@shared/lyrics'
import { parseOpenLyrics } from './parse-openlyrics'
import { parseOpenSong } from './parse-opensong'

const load = (n: string): string => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

const GRACE = [
  'Amazing grace how sweet the sound\nThat saved a wretch like me',
  'Oh sing it out for all to hear',
  'Grace is here for you and me',
  'Twas grace that taught my heart to fear\nAnd grace my fears relieved'
]
const LYRICS =
  '[Verse 1]\n' + GRACE[0] + '\n\n[Chorus]\n' + GRACE[1] + '\n\n' + GRACE[2] + '\n\n[Verse 2]\n' + GRACE[3]
const ROUND = [GRACE[0], GRACE[1], GRACE[2], GRACE[3], GRACE[1], GRACE[2]]

describe('parseOpenLyrics', () => {
  it('maps metadata, lyrics and arrangement', () => {
    const s = parseOpenLyrics(load('openlyrics.xml'), 'grace.xml')
    expect(s.title).toBe('Amazing Grace')
    expect(s.author).toBe('John Newton, Edwin Excell')
    expect(s.ccli).toBe('22025')
    expect(s.copyright).toBe('Public Domain')
    expect(s.source).toBe('OpenLyrics')
    expect(s.lyrics).toBe(LYRICS)
    expect(s.arrangement).toBe('V1 C V2 C')
    expect(s.notes).toEqual([])
    expect(s.file).toBe('grace.xml')
  })

  it('round-trips', () => {
    const s = parseOpenLyrics(load('openlyrics.xml'), 'g.xml')
    expect(buildSlides(s.lyrics, s.arrangement).map((x) => x.text)).toEqual(ROUND)
  })

  it('notes unknown verseOrder names and skips them', () => {
    const s = parseOpenLyrics(load('openlyrics.xml').replace('v1 c v2 c', 'v1 x9 c v2 c'), 'g.xml')
    expect(s.notes.join(' ')).toMatch(/x9/)
    expect(s.arrangement).toBe('V1 C V2 C')
  })

  it('keeps only the first language of a verse', () => {
    const xml = `<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>T</title></titles></properties>
      <lyrics><verse name="v1" lang="en"><lines>Hello there</lines></verse><verse name="v1" lang="de"><lines>Hallo da</lines></verse></lyrics></song>`
    const s = parseOpenLyrics(xml, 't.xml')
    expect(s.lyrics).toBe('[Verse 1]\nHello there')
    expect(s.notes.join(' ')).toMatch(/language/i)
  })

  const ol = (v: string): string =>
    `<song xmlns="http://openlyrics.info/namespace/2009/song"><properties><titles><title>T</title></titles></properties><lyrics>${v}</lyrics></song>`

  it('keeps same-name same-language verses and unnamed verses', () => {
    const s = parseOpenLyrics(
      ol('<verse name="v1" lang="en"><lines>One</lines></verse><verse name="v1" lang="en"><lines>Two</lines></verse><verse><lines>Loose</lines></verse>'),
      't.xml'
    )
    expect(s.lyrics).toBe('[Verse 1 1]\nOne\n\n[Verse 1 2]\nTwo\n\n[Slide 1]\nLoose')
    expect(s.notes.join(' ')).not.toMatch(/language/i)
  })

  it('skips different-language verses with a language note', () => {
    const s = parseOpenLyrics(
      ol('<verse name="v1" lang="en"><lines>One</lines></verse><verse name="v1" lang="de"><lines>Eins</lines></verse>'),
      't.xml'
    )
    expect(s.lyrics).toBe('[Verse 1]\nOne')
    expect(s.notes).toEqual(['1 verse in other languages skipped'])
  })

  it('throws when there are no lyrics or the xml is bad', () => {
    expect(() => parseOpenLyrics('<song><lyrics/></song>', 'x.xml')).toThrow('No lyrics found in this OpenLyrics song')
    expect(() => parseOpenLyrics('<song>', 'x.xml')).toThrow()
  })
})

describe('parseOpenSong', () => {
  it('maps metadata, lyrics and arrangement; drops chords and comments', () => {
    const s = parseOpenSong(load('opensong.xml'), 'grace.xml')
    expect(s.title).toBe('Amazing Grace')
    expect(s.author).toBe('John Newton')
    expect(s.ccli).toBe('22025')
    expect(s.copyright).toBe('Public Domain')
    expect(s.source).toBe('OpenSong')
    expect(s.lyrics).toBe(LYRICS)
    expect(s.arrangement).toBe('V1 C V2 C')
    expect(s.notes).toEqual([])
  })

  it('round-trips', () => {
    const s = parseOpenSong(load('opensong.xml'), 'g.xml')
    expect(buildSlides(s.lyrics, s.arrangement).map((x) => x.text)).toEqual(ROUND)
  })

  const wrap = (lyrics: string, pres = ''): string =>
    `<song><title>T</title><presentation>${pres}</presentation><lyrics>${lyrics}</lyrics></song>`

  it('splits slides on | and blank lines, removes _ placeholders', () => {
    const s = parseOpenSong(wrap('[V1]\n A_ma_zing | grace\n next\n\n more'), 't.xml')
    expect(s.lyrics).toBe('[Verse 1]\nAmazing\n\ngrace\nnext\n\nmore')
  })

  it('splits numbered verses in a [V] block', () => {
    const s = parseOpenSong(wrap('[V]\n1First line\n second of one\n2Second verse'), 't.xml')
    expect(s.lyrics).toBe('[Verse 1]\nFirst line\nsecond of one\n\n[Verse 2]\nSecond verse')
  })

  it('uses written order when presentation is empty and notes unknown codes', () => {
    expect(parseOpenSong(wrap('[V1]\n a\n[C]\n b'), 't.xml').arrangement).toBe('')
    const s = parseOpenSong(wrap('[V1]\n a\n[C]\n b', 'V1 C Z9 C'), 't.xml')
    expect(s.arrangement).toBe('V1 C C')
    expect(s.notes.join(' ')).toMatch(/Z9/)
  })

  it('adds no notes for blank lines between sections or a trailing ||', () => {
    const s = parseOpenSong(wrap('[V1]\n a\n b||\n\n[C]\n c\n||\n\n'), 't.xml')
    expect(s.lyrics).toBe('[Verse]\na\nb\n\n[Chorus]\nc'.replace('[Verse]', '[Verse 1]'))
    expect(s.notes).toEqual([])
  })

  it('reads CDATA lyrics and throws without lyrics', () => {
    expect(parseOpenSong('<song><title>T</title><lyrics><![CDATA[[V1]\n hi there]]></lyrics></song>', 't.xml').lyrics).toBe(
      '[Verse 1]\nhi there'
    )
    expect(() => parseOpenSong('<song><title>T</title><lyrics></lyrics></song>', 't.xml')).toThrow(
      'No lyrics found in this OpenSong song'
    )
  })
})
