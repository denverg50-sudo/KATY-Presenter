import { promises as fs } from 'fs'
import path from 'path'
import { detectFormat } from './detect'
import { decodeXml, parseXmlBible, type ParsedBible } from './parse-xml'
import { parseOpenLpCsv, parseOpenLpSqlite } from './parse-openlp'

const UNKNOWN = "This doesn't look like a Bible file. Supported: Zefania, OpenSong, OSIS, USFX, OpenLP (.sqlite or CSV)."

/** Parse the picked file(s) into a Bible. Throws Error with a user-facing message. */
export async function parseImportFiles(paths: string[]): Promise<ParsedBible> {
  const csvs = paths.filter((p) => p.toLowerCase().endsWith('.csv'))
  if (csvs.length > 0) {
    if (csvs.length !== 2 || paths.length !== 2) {
      const kind = csvs.length === 1 && paths.length === 1 ? await csvKind(csvs[0]) : null
      const base = 'OpenLP CSV needs both the books file and the verses file'
      throw new Error(kind ? `${base} — you picked only the ${kind} file (${path.basename(csvs[0])}). Pick both together.` : base)
    }
    return finish(() => parseCsvPair(csvs), csvs[1])
  }
  if (paths.length !== 1) throw new Error(UNKNOWN)
  const file = paths[0]
  const name = path.basename(file)
  let buf: Buffer
  try {
    buf = await fs.readFile(file)
  } catch (e) {
    throw new Error(`Couldn't read "${name}": ${reason(e)}`)
  }
  const format = detectFormat(buf)
  if (!format || format === 'openlp-csv') throw new Error(UNKNOWN)
  return finish(async () => {
    if (format === 'openlp-sqlite') {
      try {
        return await parseOpenLpSqlite(buf, name)
      } catch (e) {
        if (/no such table|not a database|malformed/i.test(reason(e))) throw new Error(`${name} isn't an OpenLP Bible database`)
        throw e
      }
    }
    return parseXmlBible(decodeXml(buf), format, name)
  }, file)
}

/** Which half of an OpenLP CSV pair a file is, from its header (or first row); null if it can't tell. */
export async function csvKind(file: string): Promise<'books' | 'verses' | null> {
  let first: string
  try {
    first = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0]
  } catch {
    return null
  }
  const cols = first.split(',').map((c) => c.trim().replace(/^"|"$/g, '').toLowerCase())
  if (cols.includes('book_id') && (cols.includes('chapter') || cols.includes('verse'))) return 'verses'
  if (cols.includes('testament_id') || (cols.includes('name') && cols.includes('abbreviation'))) return 'books'
  // No header: books rows are id,testament_id,name,abbreviation; verses rows are book_id,chapter,verse,text
  const num = (i: number): boolean => /^\d+$/.test(cols[i] ?? '')
  if (cols.length >= 4 && num(0) && num(1)) return num(2) ? 'verses' : 'books'
  return null
}

async function parseCsvPair(csvs: string[]): Promise<ParsedBible> {
  const texts = await Promise.all(csvs.map((p) => fs.readFile(p, 'utf8')))
  // The books file has a "name" column in its header; otherwise assume the order given.
  const swap = /book_id/i.test(texts[0].split('\n', 1)[0]) && !/book_id/i.test(texts[1].split('\n', 1)[0])
  const [books, verses] = swap ? [texts[1], texts[0]] : texts
  const versesPath = swap ? csvs[0] : csvs[1]
  return parseOpenLpCsv(books, verses, path.basename(versesPath))
}

async function finish(run: () => Promise<ParsedBible>, file: string): Promise<ParsedBible> {
  const name = path.basename(file)
  let parsed: ParsedBible
  try {
    parsed = await run()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("isn't an OpenLP") || msg.startsWith("Couldn't read")) throw e instanceof Error ? e : new Error(msg)
    throw new Error(`Couldn't read "${name}": ${reason(e)}`)
  }
  if (parsed.books.length === 0) throw new Error(`No Bible books found in ${name}`)
  return parsed
}

function reason(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e)).split('\n')[0].trim()
  return m.length > 160 ? m.slice(0, 157) + '...' : m
}
