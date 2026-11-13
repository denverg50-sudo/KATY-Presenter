/**
 * Generates the built-in Bibles (all public domain) from seven1m/open-bibles into resources/bibles/*.json.gz.
 * Usage: npm run bibles [-- --cache <dir>]   (--cache reads/writes pre-downloaded source files instead of fetching)
 */
import { promises as fs } from 'fs'
import path from 'path'
import { gzipSync } from 'zlib'
import { decodeXml, parseXmlBible, type XmlBibleFormat } from '../src/main/bible/parse-xml'
import type { Bible } from '../src/shared/types'

const BASE = 'https://raw.githubusercontent.com/seven1m/open-bibles/master/'
const OUT = path.join(__dirname, '../resources/bibles')

const SOURCES: { id: string; name: string; abbrev: string; file: string; format: XmlBibleFormat }[] = [
  { id: 'kjv', name: 'King James Version', abbrev: 'KJV', file: 'eng-kjv.osis.xml', format: 'osis' },
  { id: 'asv', name: 'American Standard Version', abbrev: 'ASV', file: 'eng-asv.zefania.xml', format: 'zefania' },
  { id: 'web', name: 'World English Bible', abbrev: 'WEB', file: 'eng-web.usfx.xml', format: 'usfx' },
  { id: 'bsb', name: 'Berean Standard Bible', abbrev: 'BSB', file: 'eng-bsb.usfx.xml', format: 'usfx' }
]

async function load(file: string, cache: string | null): Promise<Buffer> {
  if (cache) {
    const p = path.join(cache, file)
    try {
      return await fs.readFile(p)
    } catch {
      /* not cached: fetch below */
    }
  }
  const res = await fetch(BASE + file)
  if (!res.ok) throw new Error(`Download failed for ${file}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (cache) {
    await fs.mkdir(cache, { recursive: true })
    await fs.writeFile(path.join(cache, file), buf)
  }
  return buf
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--cache')
  const cache = i >= 0 ? process.argv[i + 1] : null
  await fs.mkdir(OUT, { recursive: true })
  for (const s of SOURCES) {
    const parsed = parseXmlBible(decodeXml(await load(s.file, cache)), s.format, s.file)
    const verses = parsed.books.reduce((n, b) => n + b.chapters.reduce((m, ch) => m + ch.filter(Boolean).length, 0), 0)
    if (parsed.books.length !== 66) throw new Error(`${s.id}: expected 66 books, got ${parsed.books.length}`)
    if (verses < 31000) throw new Error(`${s.id}: only ${verses} verses`)
    if (parsed.skipped.length) console.warn(`${s.id}: skipped ${parsed.skipped.length}: ${parsed.skipped.slice(0, 10).join(', ')}`)
    const bible: Bible = { id: s.id, name: s.name, abbrev: s.abbrev, builtIn: true, source: s.file, books: parsed.books }
    const gz = gzipSync(Buffer.from(JSON.stringify(bible)), { level: 9 })
    await fs.writeFile(path.join(OUT, `${s.id}.json.gz`), gz)
    console.log(`${s.id}: ${parsed.books.length} books, ${verses} verses, ${(gz.length / 1024).toFixed(0)} KB`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
