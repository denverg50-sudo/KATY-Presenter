import type { BibleMeta } from '@shared/types'

/** Confirmation text for deleting a Bible used by `n` passages in services. */
export function deleteBibleMessage(name: string, n: number): string {
  if (n === 0) return `Delete “${name}”?`
  if (n === 1)
    return `Delete “${name}”? It's used by 1 passage in your services; it'll show “Bible not installed” until you pick another translation.`
  return `Delete “${name}”? It's used by ${n} passages in your services; they'll show “Bible not installed” until you pick another translation.`
}

/** The Bible an import may replace: only while the abbreviation still matches it (ignoring case and spaces). */
export function replaceTarget(candidate: BibleMeta | null, abbrev: string): BibleMeta | null {
  return candidate && candidate.abbrev.trim().toLowerCase() === abbrev.trim().toLowerCase() ? candidate : null
}
