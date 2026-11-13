import { describe, expect, it } from 'vitest'
import { changedBibleIds, fromServiceItem, presentableKey, toServiceItem, type Presentable } from './presentable'
import type { BibleMeta } from '@shared/types'

const defaults = { versesPerSlide: 2 as const }

describe('fromServiceItem', () => {
  it('treats a legacy item without kind as a song', () => {
    expect(fromServiceItem({ id: 'i1', songId: 's1' }, defaults)).toEqual({ kind: 'song', songId: 's1' })
  })

  it('reads a scripture item and fills a missing versesPerSlide from the default', () => {
    expect(fromServiceItem({ id: 'i2', kind: 'scripture', bibleId: 'kjv', ref: 'John 3:16–18' }, defaults)).toEqual({
      kind: 'scripture',
      bibleId: 'kjv',
      ref: 'John 3:16–18',
      themeId: '',
      versesPerSlide: 2
    })
  })

  it('keeps a saved versesPerSlide and theme', () => {
    const p = fromServiceItem(
      { id: 'i3', kind: 'scripture', bibleId: 'web', ref: 'Psalm 23', themeId: 't1', versesPerSlide: 3 },
      defaults
    )
    expect(p).toEqual({ kind: 'scripture', bibleId: 'web', ref: 'Psalm 23', themeId: 't1', versesPerSlide: 3 })
  })

  it('falls back to 1 verse per slide when the saved value is out of range', () => {
    const p = fromServiceItem(
      { id: 'i4', kind: 'scripture', bibleId: 'kjv', ref: 'Jn 1', versesPerSlide: 7 as never },
      { versesPerSlide: 1 }
    )
    expect(p).toMatchObject({ versesPerSlide: 1 })
  })
})

describe('toServiceItem', () => {
  it('round-trips a song', () => {
    const p: Presentable = { kind: 'song', songId: 's1' }
    const item = toServiceItem(p, 'id1')
    expect(item).toEqual({ id: 'id1', kind: 'song', songId: 's1' })
    expect(fromServiceItem(item, defaults)).toEqual(p)
  })

  it('round-trips a scripture passage', () => {
    const p: Presentable = { kind: 'scripture', bibleId: 'kjv', ref: 'John 3:16', themeId: 't', versesPerSlide: 3 }
    const item = toServiceItem(p, 'id2')
    expect(item).toEqual({ id: 'id2', kind: 'scripture', bibleId: 'kjv', ref: 'John 3:16', themeId: 't', versesPerSlide: 3 })
    expect(fromServiceItem(item, defaults)).toEqual(p)
  })
})

describe('presentableKey', () => {
  it('is stable and distinguishes items', () => {
    const a: Presentable = { kind: 'scripture', bibleId: 'kjv', ref: 'John 3:16', themeId: '', versesPerSlide: 1 }
    expect(presentableKey(a)).toBe(presentableKey({ ...a }))
    expect(presentableKey(a)).not.toBe(presentableKey({ ...a, versesPerSlide: 2 }))
    expect(presentableKey(a)).not.toBe(presentableKey({ ...a, bibleId: 'web' }))
    expect(presentableKey({ kind: 'song', songId: 'x' })).not.toBe(presentableKey({ kind: 'song', songId: 'y' }))
  })
})

describe('changedBibleIds', () => {
  const m = (id: string, abbrev = id.toUpperCase(), verseCount = 10): BibleMeta => ({
    id, name: id, abbrev, builtIn: false, source: 't', bookCount: 1, verseCount
  })
  it('flags added, removed, renamed and replaced Bibles only', () => {
    const before = [m('a'), m('b'), m('c'), m('d')]
    const after = [m('a'), m('b', 'BB'), m('c', 'C', 11), m('e')]
    expect([...changedBibleIds(before, after)].sort()).toEqual(['b', 'c', 'd', 'e'])
  })
})
