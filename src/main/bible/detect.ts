import { decodeXml } from './parse-xml'

export type BibleFormat = 'zefania' | 'opensong' | 'osis' | 'usfx' | 'openlp-sqlite' | 'openlp-csv'

const ROOTS: Record<string, BibleFormat> = {
  xmlbible: 'zefania',
  bible: 'opensong',
  osis: 'osis',
  usfx: 'usfx'
}

export function detectFormat(buf: Buffer): BibleFormat | null {
  if (buf.length >= 16 && buf.subarray(0, 16).toString('latin1') === 'SQLite format 3\0') return 'openlp-sqlite'
  const head = decodeXml(buf.subarray(0, 16384))
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?[^>]*>/gi, '')
  const m = head.match(/<([A-Za-z_][\w.-]*)(?::([\w.-]+))?/)
  if (!m) return null
  return ROOTS[(m[2] ?? m[1]).toLowerCase()] ?? null
}
