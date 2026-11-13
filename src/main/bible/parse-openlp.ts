import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import { findBook } from '@shared/books'
import { buildBooks } from './builder'
import type { ParsedBible } from './parse-xml'

const clean = (s: string): string =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const baseName = (fileName: string): string => {
  const f = fileName.split(/[\\/]/).pop() ?? fileName
  return f.replace(/\.(csv|sqlite3?|db)$/i, '') || f
}

const toInt = (v: unknown): number => {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : 0
}

/** RFC-4180-ish CSV parser: quoted fields may contain commas, newlines and "". */
function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

type Verses = Map<number, string[][]>

function put(books: Verses, book: number, chapter: number, verse: number, text: string): void {
  if (!book || chapter < 1 || verse < 1) return
  let chs = books.get(book)
  if (!chs) books.set(book, (chs = []))
  let ch = chs[chapter - 1]
  if (!ch) chs[chapter - 1] = ch = []
  ch[verse - 1] = ch[verse - 1] ? clean(ch[verse - 1] + ' ' + text) : text
}

export function parseOpenLpCsv(booksCsv: string, versesCsv: string, fileName: string): ParsedBible {
  const bookMap = new Map<string, { num: number | null; name: string }>()
  const skipped: string[] = []
  for (const r of parseCsv(booksCsv)) {
    if (!/^\d+$/.test((r[0] ?? '').trim())) continue // header
    const name = (r[2] ?? '').trim()
    const n = findBook(name) ?? findBook((r[3] ?? '').trim())
    bookMap.set(r[0].trim(), { num: n, name })
    if (n === null && name && !skipped.includes(name)) skipped.push(name)
  }
  const books: Verses = new Map()
  for (const r of parseCsv(versesCsv)) {
    if (!/^\d+$/.test((r[0] ?? '').trim())) continue
    const b = bookMap.get(r[0].trim())
    if (!b || b.num === null) continue
    put(books, b.num, toInt(r[1]), toInt(r[2]), clean(r[3] ?? ''))
  }
  const base = baseName(fileName)
  return { name: base, abbrev: base.toUpperCase().slice(0, 12), source: 'OpenLP CSV', books: buildBooks(books), skipped }
}

export async function parseOpenLpSqlite(buf: Uint8Array, fileName: string): Promise<ParsedBible> {
  const req = createRequire(import.meta.url)
  const SQL = await initSqlJs({ locateFile: () => req.resolve('sql.js/dist/sql-wasm.wasm') })
  const db = new SQL.Database(buf)
  try {
    const meta: Record<string, string> = {}
    try {
      for (const r of db.exec('select key, value from metadata')[0]?.values ?? []) meta[String(r[0]).toLowerCase()] = String(r[1] ?? '')
    } catch {
      /* no metadata table */
    }
    const bookMap = new Map<number, number | null>()
    const skipped: string[] = []
    for (const r of db.exec('select id, book_reference_id, name from book')[0]?.values ?? []) {
      const ref = toInt(r[1])
      const name = String(r[2] ?? '')
      const n = ref >= 1 && ref <= 66 ? ref : findBook(name)
      bookMap.set(toInt(r[0]), n)
      if (n === null && name && !skipped.includes(name)) skipped.push(name)
    }
    const books: Verses = new Map()
    for (const r of db.exec('select book_id, chapter, verse, text from verse')[0]?.values ?? []) {
      const n = bookMap.get(toInt(r[0]))
      if (n) put(books, n, toInt(r[1]), toInt(r[2]), clean(String(r[3] ?? '')))
    }
    const base = baseName(fileName)
    const ver = (meta.version ?? '').trim()
    return {
      name: (meta.name ?? '').trim() || base,
      abbrev: ver && ver.length <= 12 && !/\s/.test(ver) ? ver : base.toUpperCase().slice(0, 12),
      source: 'OpenLP database',
      books: buildBooks(books),
      skipped
    }
  } finally {
    db.close()
  }
}
