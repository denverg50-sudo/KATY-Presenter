import { describe, it, expect } from 'vitest'
import { BOOKS, findBook, bookName, isSingleChapter } from './books'
import {
  parseReference, formatReference, getPassage, buildScriptureSlides, searchBible, VERSE_MARK, mapSlideIndex
} from './scripture'
import type { Bible } from './types'

describe('books', () => {
  it('has 66 numbered books', () => {
    expect(BOOKS).toHaveLength(66)
    BOOKS.forEach((b, i) => expect(b.num).toBe(i + 1))
    expect(bookName(43)).toBe('John')
  })

  it.each([
    ['Jn', 43], ['john', 43], ['1 Cor', 46], ['1co', 46], ['I Corinthians', 46],
    ['1John', 62], ['Phil', 50], ['Phm', 57], ['Ps', 19], ['Psalm', 19],
    ['Song of Songs', 22], ['Canticles', 22], ['Revelation of John', 66],
    ['GEN', 1], ['Rev', 66], ['Ju', null], ['Tobit', null]
  ])('findBook(%s) -> %s', (name, num) => {
    expect(findBook(name as string)).toBe(num)
  })
})

describe('single-chapter books', () => {
  it('flags Obadiah, Philemon, 2 John, 3 John and Jude only', () => {
    expect(BOOKS.filter((b) => isSingleChapter(b.num)).map((b) => b.num)).toEqual([31, 57, 63, 64, 65])
  })
  it.each([
    ['Jude 24-25', 'Jude 1:24–25', { c: 1, v: 24 }, { c: 1, v: 25 }],
    ['Jude 3', 'Jude 1:3', { c: 1, v: 3 }, { c: 1, v: 3 }],
    ['Philemon 6', 'Philemon 1:6', { c: 1, v: 6 }, { c: 1, v: 6 }],
    ['3 John 4', '3 John 1:4', { c: 1, v: 4 }, { c: 1, v: 4 }],
    ['Obad 15', 'Obadiah 1:15', { c: 1, v: 15 }, { c: 1, v: 15 }],
    ['2 John 12', '2 John 1:12', { c: 1, v: 12 }, { c: 1, v: 12 }],
    ['Jude 1:24-25', 'Jude 1:24–25', { c: 1, v: 24 }, { c: 1, v: 25 }],
    ['Jude 1', 'Jude 1', { c: 1, v: null }, { c: 1, v: null }]
  ])('%s -> %s', (input, out, from, to) => {
    const r = parseReference(input) as any
    expect(r.ranges).toEqual([{ from, to }])
    expect(formatReference(r)).toBe(out)
  })
  it('keeps chapter 1 across comma lists', () => {
    expect(formatReference(parseReference('Jude 3, 5-6') as any)).toBe('Jude 1:3, 5–6')
  })
  it('looks up verses of chapter 1, with singular errors', () => {
    const p = getPassage(mkBible(), parseReference('Jude 2-3') as any)
    expect('error' in p ? p.error : p.verses.map((v) => v.text)).toEqual(['Jude two.', 'Jude three.'])
    expect(getPassage(mkBible(), parseReference('Jude 2:1') as any)).toEqual({ error: 'Jude has 1 chapter' })
    const one: Bible = { ...mkBible(), books: [{ num: 65, chapters: [['Only.']] }] }
    expect(getPassage(one, parseReference('Jude 1:2') as any)).toEqual({ error: 'Jude 1 has 1 verse' })
  })
})

describe('parseReference', () => {
  it.each([
    ['John 3:16', 'John 3:16'],
    ['Jn 3:16-18', 'John 3:16–18'],
    ['1 Cor 13:4-7', '1 Corinthians 13:4–7'],
    ['1co 13 4', '1 Corinthians 13:4'],
    ['Ps 23', 'Psalms 23'],
    ['John 3:16-4:2', 'John 3:16–4:2'],
    ['Rom 8:28, 31-39', 'Romans 8:28, 31–39'],
    ['  jn.3.16 ', 'John 3:16']
  ])('%s -> %s', (input, out) => {
    const r = parseReference(input)
    expect('error' in r).toBe(false)
    expect(formatReference(r as any)).toBe(out)
  })

  it('structures whole chapters and multiple ranges', () => {
    expect(parseReference('Ps 23')).toEqual({ book: 19, ranges: [{ from: { c: 23, v: null }, to: { c: 23, v: null } }] })
    const r = parseReference('Rom 8:28, 31-39') as any
    expect(r.ranges).toEqual([
      { from: { c: 8, v: 28 }, to: { c: 8, v: 28 } },
      { from: { c: 8, v: 31 }, to: { c: 8, v: 39 } }
    ])
  })

  it('reports errors', () => {
    expect(parseReference('Hezekiah 1:1')).toEqual({ error: 'Unknown book "Hezekiah"' })
    expect(parseReference('John')).toEqual({ error: 'Add a chapter, e.g. John 3' })
    const r = parseReference('John 3:18-16') as any
    expect(r.error).toContain('backwards')
  })
})

const mkBible = (): Bible => ({
  id: 'tst', name: 'Test Bible', abbrev: 'TST', builtIn: false, source: 'test',
  books: [
    {
      num: 43,
      chapters: [
        ['Alpha one.'],
        [],
        ['God had love for one and all.', 'Say one word.', 'A third line of love.', 'Fourth line here.'],
        ['Chapter four first.', 'Chapter four second.']
      ]
    },
    { num: 65, chapters: [['Jude one.', 'Jude two.', 'Jude three.']] }
  ]
})
const ref = (t: string) => {
  const r = parseReference(t)
  if ('error' in r) throw new Error(r.error)
  return r
}
const pass = (t: string) => {
  const p = getPassage(mkBible(), ref(t))
  if ('error' in p) throw new Error(p.error)
  return p
}

describe('getPassage', () => {
  it('spans chapters', () => {
    expect(pass('John 3:2-4:1').verses).toHaveLength(4)
  })
  it('whole chapter', () => {
    const p = pass('John 3')
    expect(p.verses).toHaveLength(4)
    expect(p.abbrev).toBe('TST')
    expect(p.bibleId).toBe('tst')
    expect(p.reference).toBe('John 3')
  })
  it('errors on an empty chapter', () => {
    expect(getPassage(mkBible(), ref('John 2'))).toEqual({ error: "TST doesn't contain John 2" })
  })
  it('errors', () => {
    expect(getPassage(mkBible(), ref('John 3:99'))).toEqual({ error: 'John 3 has 4 verses' })
    expect(getPassage(mkBible(), ref('John 9:1'))).toEqual({ error: 'John has 4 chapters' })
    expect(getPassage(mkBible(), ref('Genesis 1:1'))).toEqual({ error: "TST doesn't contain Genesis" })
  })
})

describe('buildScriptureSlides', () => {
  it('groups verses with numbers, labels and footers', () => {
    const slides = buildScriptureSlides(pass('John 3:1-3'), 2, true)
    expect(slides).toHaveLength(2)
    expect(slides[0].text).toBe(`${VERSE_MARK(1)} God had love for one and all. ${VERSE_MARK(2)} Say one word.`)
    expect(slides[0].label).toBe('3:1–2')
    expect(slides[0].footer).toBe('John 3:1–2 · TST')
    expect(slides[1].footer).toBe('John 3:3 · TST')
    expect(new Set(slides.map((s) => s.key)).size).toBe(2)
  })
  it('omits verse numbers when off', () => {
    const slides = buildScriptureSlides(pass('John 3:1-3'), 2, false)
    slides.forEach((s) => expect(s.text).not.toContain('⟦'))
  })
  it('does not merge adjacent ranges', () => {
    expect(buildScriptureSlides(pass('John 3:1-2, 3'), 3, true)).toHaveLength(2)
  })
  it('a chapter-crossing range shares a slide', () => {
    const s = buildScriptureSlides(pass('John 3:4-4:1'), 3, false)
    expect(s).toHaveLength(1)
    expect(s[0].label).toBe('3:4–4:1')
  })
  it('does not merge across range boundaries', () => {
    const slides = buildScriptureSlides(pass('John 3:1, 3'), 3, true)
    expect(slides).toHaveLength(2)
  })
})

describe('mapSlideIndex', () => {
  const at = (r: string, versesPerSlide: 1 | 2 | 3) => ({ passage: pass(r), versesPerSlide })
  it('keeps the first showing verse when verses per slide changes', () => {
    // 1 per slide, slide 2 = 3:3 -> 2 per slide: [3:1-2][3:3-4] -> slide 1
    expect(mapSlideIndex(at('John 3', 1), 2, at('John 3', 2))).toBe(1)
    // 2 per slide, slide 1 = 3:3-4 -> 1 per slide -> 3:3 = slide 2
    expect(mapSlideIndex(at('John 3', 2), 1, at('John 3', 1))).toBe(2)
    expect(mapSlideIndex(at('John 3', 1), 3, at('John 3', 3))).toBe(1)
  })
  it('keeps the slide for the same layout (e.g. another translation)', () => {
    expect(mapSlideIndex(at('John 3:1-3', 1), 1, at('John 3:1-3', 1))).toBe(1)
  })
  it('falls back to the verse position when the verse is missing, clamped', () => {
    expect(mapSlideIndex(at('John 3', 1), 3, at('John 3:1-2', 1))).toBe(1)
    expect(mapSlideIndex(at('John 3', 1), 99, at('John 3', 2))).toBe(1)
  })
})

describe('searchBible', () => {
  it('requires all words, case-insensitive', () => {
    expect(searchBible(mkBible(), 'LOVE one').map((v) => v.v)).toEqual([1])
    expect(searchBible(mkBible(), 'LOVE line').map((v) => v.v)).toEqual([3])
    expect(searchBible(mkBible(), 'love')).toHaveLength(2)
  })
  const words: Bible = {
    ...mkBible(),
    books: [
      {
        num: 62,
        chapters: [
          [
            'This is his commandment from God.', // "is" only inside his/this... plus a real "is"
            'He that loveth not knoweth not God; for God is love.',
            'Love is of God, and the beloved love.',
            'His glove was this one, God knows.'
          ]
        ]
      }
    ]
  }
  it('matches words at the start of a word only', () => {
    expect(searchBible(words, 'love').map((v) => v.v)).toEqual([2, 3]) // loveth/Love, not beloved/glove alone
    expect(searchBible(words, 'God is love').map((v) => v.v)).toEqual([2, 3])
    expect(searchBible(words, 'is glove')).toEqual([]) // "is" only inside his/this in verse 4
  })
  it('lists verses with the exact phrase first, then canon order, capped', () => {
    expect(searchBible(words, 'love is').map((v) => v.v)).toEqual([3, 2])
    expect(searchBible(words, 'god is love').map((v) => v.v)).toEqual([2, 3])
    expect(searchBible(words, 'love is', 1).map((v) => v.v)).toEqual([3])
    expect(searchBible(words, 'is god', 1).map((v) => v.v)).toEqual([1])
  })
  it('empty query', () => {
    expect(searchBible(mkBible(), '')).toEqual([])
    expect(searchBible(mkBible(), '   ')).toEqual([])
  })
})
