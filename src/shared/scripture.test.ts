import { describe, it, expect } from 'vitest'
import { BOOKS, findBook, bookName } from './books'
import { parseReference, formatReference } from './scripture'

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
