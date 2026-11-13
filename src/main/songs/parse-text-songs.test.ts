import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSlides } from '@shared/lyrics'
import { detectSongFormat } from './detect-song'
import { decodeText, parseChordPro, parsePlainText, parseSongSelectUsr } from './parse-text-songs'

const raw = (n: string): Buffer => readFileSync(join(__dirname, 'fixtures', n))
const load = (n: string): string => decodeText(raw(n))

const V1 = 'Amazing grace how sweet the sound\nThat saved a wretch like me'
const C = 'Oh sing it out for all to hear\n\nGrace is here for you and me'
const V2 = 'Twas grace that taught my heart to fear\nAnd grace my fears relieved'

describe('decodeText', () => {
  it('strips BOM and normalises line endings', () => {
    const t = decodeText(raw('plain.txt'))
    expect(t.charCodeAt(0)).not.toBe(0xfeff)
    expect(t).not.toContain('\r')
    expect(t).toContain('“Amazing grace”')
  })
  it('decodes UTF-16 LE and BE with BOM', () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('a\r\nb', 'utf16le')])
    expect(decodeText(le)).toBe('a\nb')
    const be = Buffer.from(le.subarray(2)).swap16()
    expect(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toBe('a\nb')
  })
  it('falls back to Windows-1252', () => {
    expect(decodeText(Buffer.from([0x49, 0x92, 0x6d, 0x20, 0xe9]))).toBe('I’m é')
  })
})

describe('parseChordPro', () => {
  const s = parseChordPro(load('song.cho'), 'grace.cho')
  it('maps metadata', () => {
    expect(s.title).toBe('Amazing Grace')
    expect(s.author).toBe('John Newton')
    expect(s.ccli).toBe('22025')
    expect(s.copyright).toBe('Public Domain')
    expect(s.source).toBe('ChordPro')
  })
  it('strips chords, comments and tab blocks; keeps sections and repeated chorus', () => {
    expect(s.lyrics).toBe(`[Verse 1]\n${V1}\n\n[Chorus]\n${C}\n\n[Verse 2]\n${V2}`)
    expect(s.arrangement).toBe('V1 C V2 C')
    expect(s.lyrics).not.toMatch(/[|]|Repeat softly|a comment/)
    expect(s.notes).toEqual([expect.stringMatching(/tab/i)])
    expect(buildSlides(s.lyrics, s.arrangement)).toHaveLength(6)
  })
  it('falls back to the file name and throws when empty', () => {
    expect(parseChordPro('{sov}\nHello\n{eov}', 'x/My Song.cho').title).toBe('My Song')
    expect(() => parseChordPro('{title: T}\n', 'a.cho')).toThrow('No lyrics found in this ChordPro song')
  })
})

describe('parseSongSelectUsr', () => {
  const s = parseSongSelectUsr(load('song.usr'), 'grace.usr')
  it('maps fields', () => {
    expect(s.title).toBe('Amazing Grace')
    expect(s.author).toBe('John Newton, Edwin Excell')
    expect(s.copyright).toBe('Public Domain')
    expect(s.ccli).toBe('22025')
    expect(s.source).toBe('SongSelect')
    expect(s.lyrics).toBe(`[Verse 1]\n${V1}\n\n[Chorus]\n${C}\n\n[Verse 2]\n${V2}`)
    expect(s.arrangement).toBe('')
    expect(s.notes).toEqual([])
  })
  it('throws when there are no words', () => {
    expect(() => parseSongSelectUsr('[File]\n[S A1]\nTitle=T\nFields=Verse 1\nWords=\n', 'a.usr')).toThrow(
      'No lyrics found in this SongSelect song'
    )
  })
})

describe('parsePlainText', () => {
  it('parses a SongSelect text file and drops the footer', () => {
    const s = parsePlainText(load('songselect.txt'), 'grace.txt')
    expect(s.title).toBe('Amazing Grace')
    expect(s.author).toBe('John Newton')
    expect(s.ccli).toBe('22025')
    expect(s.copyright).toBe('1779 Public Domain')
    expect(s.source).toBe('SongSelect')
    expect(s.lyrics).toBe(`[Verse 1]\n${V1}\n\n[Chorus]\n${C}\n\n[Verse 2]\n${V2}`)
    expect(s.lyrics).not.toMatch(/CCLI|SongSelect|©|John Newton/)
  })
  it('handles an unlabelled file with BOM, CRLF and curly quotes', () => {
    const s = parsePlainText(load('plain.txt'), 'plain.txt')
    expect(s.source).toBe('Text')
    expect(s.title).toBe('Amazing Grace')
    expect(s.lyrics).toBe(
      '[Slide 1]\n“Amazing grace” how sweet the sound\nThat saved a wretch like me\n\nI once was lost, but now I’m found'
    )
    expect(s.lyrics).not.toContain('\r')
  })
  it('accepts label variants and reuses identical repeated sections', () => {
    const s = parsePlainText('T\n\nVERSE 1:\nA line\n\nChorus 1\nB line\n\nverse 2\nC line\n\nCHORUS 1:\nB line\n', 't.txt')
    expect(s.lyrics).toBe('[Verse 1]\nA line\n\n[Chorus 1]\nB line\n\n[Verse 2]\nC line')
    expect(s.arrangement).toBe('V1 C1 V2 C1')
  })
  it('throws when there are no lyrics', () => {
    expect(() => parsePlainText('Only a title\n', 'x.txt')).toThrow('No lyrics found in this text song')
  })
})

describe('detectSongFormat', () => {
  it('recognises each fixture', () => {
    expect(detectSongFormat(raw('openlyrics.xml'), 'a.xml')).toBe('openlyrics')
    expect(detectSongFormat(raw('opensong.xml'), 'a')).toBe('opensong')
    expect(detectSongFormat(raw('song.cho'), 'a.cho')).toBe('chordpro')
    expect(detectSongFormat(raw('song.usr'), 'a.usr')).toBe('usr')
    expect(detectSongFormat(raw('songselect.txt'), 'a.txt')).toBe('text')
    expect(detectSongFormat(raw('plain.txt'), 'plain.txt')).toBe('text')
  })
  it('recognises FreeShow json', () => {
    const show = { slides: { a: { group: 'v', items: [] } }, layouts: { l: { slides: [{ id: 'a' }] } } }
    expect(detectSongFormat(Buffer.from(JSON.stringify(['id1', show])), 'Song.show')).toBe('freeshow')
  })
  it('returns null for junk', () => {
    expect(detectSongFormat(Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31, 0, 0]), '.DS_Store')).toBeNull()
    expect(detectSongFormat(Buffer.from('Read me first.\n'), 'README.txt')).toBeNull()
    expect(detectSongFormat(Buffer.from('{"theme":"dark"}'), 'settings.json')).toBeNull()
    expect(detectSongFormat(Buffer.from([0x50, 0x52, 0x4f, 0, 1, 2, 3]), 'song.pro')).toBeNull()
    expect(detectSongFormat(Buffer.from('<html><body>hi</body></html>'), 'a.xml')).toBeNull()
    expect(detectSongFormat(Buffer.from('two\nlines\nhere'), 'notes.md')).toBeNull()
  })
})
