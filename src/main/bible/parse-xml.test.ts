import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeXml, parseXmlBible } from './parse-xml'
import { detectFormat } from './detect'

const fx = (n: string): Buffer => readFileSync(join(__dirname, 'fixtures', n))

// OpenSong fixture is stored in UTF-8 here but must be exercised as ISO-8859-1 on disk.
const opensongLatin1 = (): Buffer => {
  const s = readFileSync(join(__dirname, 'fixtures', 'opensong.xml'), 'utf8')
  return Buffer.from(s.replace(/[“”]/g, '"'), 'latin1')
}

const JOHN316 = 'For the Giver so cherished the world, “every soul” that trusts shall not perish, café and gain light.'
const JOHN316_LATIN = 'For the Giver so cherished the world, "every soul" that trusts shall not perish, café and gain light.'
const PS231 = 'The Maker is my guide; I shall not wander.'

const cases: [string, 'zefania' | 'opensong' | 'osis' | 'usfx', string, string][] = [
  ['zefania.xml', 'zefania', 'Tobit', JOHN316],
  ['osis-milestone.xml', 'osis', 'Tob', JOHN316],
  ['osis-container.xml', 'osis', 'Tob', JOHN316],
  ['usfx.xml', 'usfx', 'TOB', JOHN316]
]

describe('parseXmlBible', () => {
  for (const [file, fmt, skip, text] of cases) {
    it(`parses ${file}`, () => {
      const buf = fx(file)
      expect(detectFormat(buf)).toBe(fmt)
      const b = parseXmlBible(decodeXml(buf), fmt, file)
      const john = b.books.find((x) => x.num === 43)!
      expect(john.chapters[2][15]).toBe(text)
      expect(john.chapters[2][16]).toBe('') // missing verse 17 does not shift 18
      expect(john.chapters[2][17]).toBe('Skipped ahead.')
      expect(john.chapters[0]).toEqual([]) // missing chapters are empty
      expect(b.books.find((x) => x.num === 19)!.chapters[22][0]).toBe(PS231)
      expect(b.skipped).toContain(skip)
      expect(b.books.length).toBe(2)
      expect(b.source).toBeTruthy()
    })
  }

  it('parses ISO-8859-1 OpenSong', () => {
    const buf = opensongLatin1()
    expect(detectFormat(buf)).toBe('opensong')
    const b = parseXmlBible(decodeXml(buf), 'opensong', 'opensong.xml')
    expect(b.books.find((x) => x.num === 43)!.chapters[2][15]).toBe(JOHN316_LATIN)
    expect(b.books.find((x) => x.num === 19)!.chapters[22][0]).toBe(PS231)
    expect(b.skipped).toContain('Tobit')
    expect(b.name).toBe('opensong')
  })

  it('reads metadata', () => {
    const z = parseXmlBible(decodeXml(fx('zefania.xml')), 'zefania', 'zefania.xml')
    expect(z.name).toBe('Sample Zefania Bible')
    expect(z.abbrev).toBe('SZB')
    const o = parseXmlBible(decodeXml(fx('osis-milestone.xml')), 'osis', 'osis-milestone.xml')
    expect(o.name).toBe('Sample OSIS Milestone Bible')
    expect(o.abbrev).toBe('SOM')
  })
})

describe('decodeXml', () => {
  it('strips a UTF-8 BOM', () => {
    const plain = fx('zefania.xml')
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), plain])
    expect(decodeXml(bom)).toBe(decodeXml(plain))
    expect(decodeXml(bom).charCodeAt(0)).not.toBe(0xfeff)
  })
  it('honours the encoding declaration', () => {
    const s = '<?xml version="1.0" encoding="windows-1252"?><a>café</a>'
    expect(decodeXml(Buffer.from(s, 'latin1'))).toContain('café')
  })
})

describe('detectFormat', () => {
  it('detects each format', () => {
    expect(detectFormat(fx('zefania.xml'))).toBe('zefania')
    expect(detectFormat(fx('osis-container.xml'))).toBe('osis')
    expect(detectFormat(fx('usfx.xml'))).toBe('usfx')
    expect(detectFormat(Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(100)]))).toBe('openlp-sqlite')
  })
  it('returns null for non-bibles', () => {
    expect(detectFormat(Buffer.from('<html>'))).toBeNull()
    expect(detectFormat(Buffer.from(''))).toBeNull()
  })
})
