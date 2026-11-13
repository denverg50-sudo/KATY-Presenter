import { SaxesParser } from 'saxes'
import { findBook } from '@shared/books'
import type { BibleBook } from '@shared/types'
import { buildBooks } from './builder'

export interface ParsedBible {
  name: string
  abbrev: string
  source: string
  books: BibleBook[]
  skipped: string[]
}

export type XmlBibleFormat = 'zefania' | 'opensong' | 'osis' | 'usfx'

export function decodeXml(buf: Buffer): string {
  let enc = 'utf-8'
  let start = 0
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) start = 3
  else if (buf[0] === 0xff && buf[1] === 0xfe) enc = 'utf-16le'
  else if (buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder('utf-16le').decode(Buffer.from(buf).swap16())
  } else {
    const head = buf.subarray(0, 200).toString('latin1')
    const m = head.match(/^\s*<\?xml[^>]*?encoding\s*=\s*["']([^"']+)["']/i)
    if (m) {
      const e = m[1].toLowerCase()
      if (/^(iso-?8859-?1|latin-?1|l1)$/.test(e)) enc = 'windows-1252'
      else if (/^(windows-?1252|cp1252)$/.test(e)) enc = 'windows-1252'
      else if (e !== 'utf-8' && e !== 'utf8') {
        try {
          new TextDecoder(e)
          enc = e
        } catch {
          /* unknown encoding: fall back to utf-8 */
        }
      }
    }
  }
  const s = new TextDecoder(enc).decode(buf.subarray(start))
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

const SKIP = new Set(['note', 'f', 'x', 'fe', 'ef', 'ex', 'rf', 'remark', 'rem', 'fig'])
// USFX elements whose text lives between verses (or is not scripture text); ignored even inside an unterminated verse.
const USFX_SKIP = new Set(['h', 'toc', 'id', 'ide', 'mt', 'mt1', 'mt2', 'mt3', 's', 's1', 's2', 's3', 'r', 'sp', 'd', 'cl', 'cp', 'ca', 'cd', 'periph'])
const OSIS_SKIP = new Set(['rdg', 'header'])
const BREAKS = /^(p|q\d?|m|mi|b|l|lg|lb|li\d?|pi\d?|nb|d)$/

const SOURCE_LABEL: Record<XmlBibleFormat, string> = {
  zefania: 'Zefania XML',
  opensong: 'OpenSong XML',
  osis: 'OSIS XML',
  usfx: 'USFX XML'
}

const num = (s: string | undefined): number => {
  const n = parseInt(s ?? '', 10)
  return Number.isFinite(n) ? n : 0
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()

function baseName(fileName: string): string {
  const f = fileName.split(/[\\/]/).pop() ?? fileName
  return f.replace(/\.xml$/i, '').replace(/\.(osis|zefania|usfx|opensong)$/i, '') || f
}

export function parseXmlBible(xml: string, format: XmlBibleFormat, fileName: string): ParsedBible {
  const parser = new SaxesParser({ xmlns: false, fragment: false })
  const books = new Map<number, string[][]>()
  const skipped: string[] = []
  const skip = (name: string): void => {
    if (name && !skipped.includes(name)) skipped.push(name)
  }

  // Current position.
  let book = 0 // 0 = none/skipped
  let chapter = 0
  let verse = 0
  let buf: string[] | null = null // non-null while collecting verse text
  let skipDepth = 0
  let osisMilestone = false // current <verse> is an sID/eID milestone (self-closing)
  const path: string[] = []

  // Metadata.
  let title = ''
  let ident = ''
  let metaTarget: 'title' | 'ident' | null = null
  let metaText = ''

  const endVerse = (): void => {
    if (buf && book && chapter > 0 && verse > 0) {
      const text = collapse(buf.join(''))
      let chs = books.get(book)
      if (!chs) books.set(book, (chs = []))
      let ch = chs[chapter - 1]
      if (!ch) chs[chapter - 1] = ch = []
      ch[verse - 1] = ch[verse - 1] ? collapse(ch[verse - 1] + ' ' + text) : text
    }
    buf = null
  }
  const startVerse = (v: number): void => {
    endVerse()
    verse = v
    buf = book && chapter > 0 && v > 0 ? [] : null
  }
  const setBook = (name: string, fallbackNum = 0): void => {
    endVerse()
    chapter = 0
    verse = 0
    // Zefania: a canonical bnumber wins; otherwise fall back to the book name.
    let n: number | null = fallbackNum >= 1 && fallbackNum <= 66 ? fallbackNum : findBook(name)
    book = n ?? 0
    if (n === null) skip(name || String(fallbackNum))
  }

  parser.on('opentag', (tag) => {
    const name = tag.name.toLowerCase()
    const a = tag.attributes as Record<string, string>
    path.push(name)

    if (skipDepth > 0) {
      skipDepth++
      return
    }
    // Metadata (outside scripture).
    if (!book && !buf) {
      if (format === 'zefania' && name === 'xmlbible' && a.biblename && !title) title = a.biblename
      if (name === 'title' && !title && (path.includes('information') || path.includes('work'))) {
        metaTarget = 'title'
        metaText = ''
      } else if (name === 'identifier' && !ident && (path.includes('information') || path.includes('work'))) {
        metaTarget = 'ident'
        metaText = ''
      }
      if (format === 'osis' && name === 'osistext' && a.osisIDWork && !ident) ident = a.osisIDWork
    }

    if (SKIP.has(name) && buf) {
      skipDepth = 1
      return
    }
    if (format === 'usfx' && buf && USFX_SKIP.has(name)) {
      skipDepth = 1
      return
    }
    if (format === 'osis' && buf && OSIS_SKIP.has(name)) {
      skipDepth = 1
      return
    }

    switch (format) {
      case 'zefania':
        if (name === 'biblebook') setBook(a.bname ?? '', num(a.bnumber))
        else if (name === 'chapter') {
          endVerse()
          chapter = num(a.cnumber)
        } else if (name === 'vers') startVerse(num(a.vnumber))
        break
      case 'opensong':
        if (name === 'b') setBook(a.n ?? '')
        else if (name === 'c') {
          endVerse()
          chapter = num(a.n)
        } else if (name === 'v') startVerse(num(a.n))
        break
      case 'osis':
        if (name === 'verse') {
          osisMilestone = !!(a.sID || a.eID)
          if (a.eID) {
            endVerse()
          } else if (a.osisID) {
            const [b, c, v] = a.osisID.split(/\s+/)[0].split('.')
            const n = findBook(b)
            if (n === null) skip(b)
            book = n ?? 0
            chapter = num(c)
            startVerse(num(v))
          }
        } else if (name === 'div' && a.type === 'book' && a.osisID) {
          endVerse()
          const n = findBook(a.osisID)
          if (n === null) skip(a.osisID)
          book = n ?? 0
          chapter = 0
        } else if (buf && BREAKS.test(name)) buf.push(' ')
        break
      case 'usfx':
        if (name === 'book') setBook(a.id ?? '')
        else if (name === 'c') {
          endVerse()
          chapter = num(a.id)
        } else if (name === 'v') startVerse(num(a.id))
        else if (name === 've') endVerse()
        else if (buf && BREAKS.test(name)) buf.push(' ')
        break
    }
  })

  parser.on('closetag', (tag) => {
    const name = tag.name.toLowerCase()
    path.pop()
    if (skipDepth > 0) {
      skipDepth--
      return
    }
    if (metaTarget && (name === 'title' || name === 'identifier')) {
      const t = collapse(metaText)
      if (metaTarget === 'title') title = t
      else ident = t
      metaTarget = null
    }
    if ((format === 'zefania' && name === 'vers') || (format === 'opensong' && name === 'v')) endVerse()
    else if (format === 'osis' && name === 'verse' && buf && !osisMilestone) endVerse()
  })

  parser.on('text', (t) => {
    if (skipDepth > 0) return
    if (buf) buf.push(t)
    else if (metaTarget) metaText += t
  })

  parser.on('cdata', (t) => {
    if (skipDepth === 0 && buf) buf.push(t)
  })

  parser.write(xml).close()
  endVerse()

  const out = buildBooks(books)

  const base = baseName(fileName)
  const abbrev = ident && ident.length <= 12 && !/\s/.test(ident) ? ident : base.toUpperCase().slice(0, 12)
  return { name: title || base, abbrev, source: SOURCE_LABEL[format], books: out, skipped }
}
