import { describe, expect, it } from 'vitest'
import { highlight, readReference, snippet, usableReference } from './referenceInput'

describe('readReference', () => {
  it('shows nothing for empty input', () => {
    expect(readReference('   ')).toEqual({ state: 'empty' })
  })

  it('reads a complete reference with a verse count', () => {
    const r = readReference('jn 3:16-18')
    expect(r).toMatchObject({ state: 'ok', formatted: 'John 3:16–18', count: 3 })
  })

  it('has no count for whole chapters or ranges across chapters', () => {
    expect(readReference('Ps 23')).toMatchObject({ state: 'ok', count: null })
    expect(readReference('Gen 1:31-2:3')).toMatchObject({ state: 'ok', count: null })
  })

  it.each(['Rom 8:28,', 'Ps 23:', 'John 3:16-', 'John 3:16 -', 'John 3:16–'])(
    'treats a trailing separator as still typing (%s)',
    (text) => {
      const r = readReference(text)
      expect(r.state).toBe('partial')
      expect(usableReference(r)).not.toBeNull()
    }
  )

  it('keeps the last complete reference while typing on', () => {
    expect(readReference('Rom 8:28,')).toMatchObject({ state: 'partial', last: 'Romans 8:28', lastCount: 1 })
  })

  it('treats a book still being typed as partial, not an error', () => {
    expect(readReference('Jo').state).toBe('partial')
    expect(readReference('1').state).toBe('partial')
    expect(readReference('1 Co').state).toBe('partial')
    expect(readReference('John').state).toBe('partial') // no chapter yet
  })

  it('reports genuinely wrong input as an error', () => {
    expect(readReference('Hezekiah 3:1')).toMatchObject({ state: 'error' })
    expect(readReference('Xyz')).toMatchObject({ state: 'error' })
    expect(readReference('John 3:18-16')).toMatchObject({ state: 'error' })
    expect(usableReference(readReference('Xyz'))).toBeNull()
  })
})

describe('snippet and highlight', () => {
  const text =
    'A new commandment I give unto you, That ye love one another; as I have loved you, that ye also love one another.'

  it('cuts about 60 characters around the first match', () => {
    const s = snippet(text, 'love one')
    expect(s.text.length).toBeLessThanOrEqual(60)
    expect(s.text.toLowerCase()).toContain('love')
    expect(s.start).toBe(true)
  })

  it('marks every matched word case-insensitively', () => {
    const parts = highlight('That ye Love one another', 'love one')
    expect(parts.filter((p) => p.hit).map((p) => p.s)).toEqual(['Love', 'one'])
    expect(parts.map((p) => p.s).join('')).toBe('That ye Love one another')
  })

  it('marks only matches at the start of a word', () => {
    const parts = highlight('This is his beloved; God is love, he loveth.', 'is love')
    expect(parts.filter((p) => p.hit).map((p) => p.s)).toEqual(['is', 'is', 'love', 'love'])
    expect(parts.map((p) => p.s).join('')).toBe('This is his beloved; God is love, he loveth.')
  })

  it('centres the snippet on a word-start match, not a match inside a word', () => {
    const long = 'He spake of his beloved and of the glove, and this went on and on for many a mile; and God is love.'
    expect(snippet(long, 'love').text).toContain('God is love')
  })
})
