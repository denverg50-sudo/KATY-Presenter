import type { ServiceItem } from '@shared/types'

export type VersesPerSlide = 1 | 2 | 3

/** Something that can be selected, shown live and placed in a service: a song or a Bible passage. */
export type Presentable =
  | { kind: 'song'; songId: string }
  | { kind: 'scripture'; bibleId: string; ref: string; themeId: string; versesPerSlide: VersesPerSlide }

export const asVersesPerSlide = (n: unknown, fallback: VersesPerSlide = 1): VersesPerSlide =>
  n === 1 || n === 2 || n === 3 ? n : fallback

/** A missing `kind` means song, so services saved before Bibles keep working. */
export function fromServiceItem(item: ServiceItem, defaults: { versesPerSlide: VersesPerSlide }): Presentable {
  if (item.kind === 'scripture') {
    return {
      kind: 'scripture',
      bibleId: item.bibleId ?? '',
      ref: item.ref ?? '',
      themeId: item.themeId ?? '',
      versesPerSlide: asVersesPerSlide(item.versesPerSlide, asVersesPerSlide(defaults.versesPerSlide))
    }
  }
  return { kind: 'song', songId: item.songId ?? '' }
}

export function toServiceItem(p: Presentable, id: string): ServiceItem {
  if (p.kind === 'song') return { id, kind: 'song', songId: p.songId }
  return { id, kind: 'scripture', bibleId: p.bibleId, ref: p.ref, themeId: p.themeId, versesPerSlide: p.versesPerSlide }
}

/** Stable identity for caches and comparisons. */
export function presentableKey(p: Presentable): string {
  return p.kind === 'song'
    ? `song|${p.songId}`
    : `scripture|${p.bibleId}|${p.ref}|${p.versesPerSlide}|${p.themeId}`
}

/** Cache key for a looked-up passage (independent of slide layout). */
export const passageKey = (bibleId: string, ref: string): string => `${bibleId}|${ref}`

export const samePresentable = (a: Presentable | null | undefined, b: Presentable | null | undefined): boolean =>
  !!a &&
  !!b &&
  (a.kind === 'song'
    ? b.kind === 'song' && a.songId === b.songId
    : b.kind === 'scripture' &&
      a.bibleId === b.bibleId &&
      a.ref === b.ref &&
      a.versesPerSlide === b.versesPerSlide &&
      a.themeId === b.themeId)
