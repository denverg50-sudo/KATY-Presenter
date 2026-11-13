import { describe, it, expect } from 'vitest'
import { deleteBibleMessage, replaceTarget } from './bibleMessages'
import type { BibleMeta } from '@shared/types'

describe('deleteBibleMessage', () => {
  it('words 0, 1 and many uses', () => {
    expect(deleteBibleMessage('My NIV', 0)).toBe('Delete “My NIV”?')
    expect(deleteBibleMessage('My NIV', 1)).toBe(
      "Delete “My NIV”? It's used by 1 passage in your services; it'll show “Bible not installed” until you pick another translation."
    )
    expect(deleteBibleMessage('My NIV', 3)).toBe(
      "Delete “My NIV”? It's used by 3 passages in your services; they'll show “Bible not installed” until you pick another translation."
    )
  })
})

describe('replaceTarget', () => {
  const niv: BibleMeta = { id: 'x1', name: 'NIV', abbrev: 'NIV', builtIn: false, source: 'test', bookCount: 66, verseCount: 1 }
  it('offers Replace only while the abbreviation matches (ignoring case and spaces)', () => {
    expect(replaceTarget(niv, 'NIV')).toBe(niv)
    expect(replaceTarget(niv, ' niv ')).toBe(niv)
    expect(replaceTarget(niv, 'NIV84')).toBeNull()
    expect(replaceTarget(null, 'NIV')).toBeNull()
  })
})
