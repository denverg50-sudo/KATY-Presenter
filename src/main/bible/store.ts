import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { gunzip } from 'zlib'
import { promisify } from 'util'
import { writeAtomic } from '../storage'
import { parseReference, getPassage, searchBible } from '../../shared/scripture'
import type { Bible, BibleMeta, ImportPreview, Passage, PassageVerse } from '../../shared/types'
import type { ParsedBible } from './parse-xml'
import { parseImportFiles } from './parse-files'

const gunzipAsync = promisify(gunzip)
const SAFE_ID = /^[A-Za-z0-9_-]+$/
const BUILT_IN_IDS = ['kjv', 'asv', 'web', 'bsb']
const LRU_SIZE = 3

interface ImportFile {
  meta: BibleMeta
  bible: Bible
}

async function parseInWorker(paths: string[]): Promise<ParsedBible> {
  if (process.env.VITEST) return parseImportFiles(paths)
  const { runImport } = await import('./run-import')
  return runImport(paths)
}

const metaOf = (b: Bible): BibleMeta => ({
  id: b.id,
  name: b.name,
  abbrev: b.abbrev,
  builtIn: b.builtIn,
  source: b.source,
  bookCount: b.books.length,
  verseCount: b.books.reduce((n, bk) => n + bk.chapters.reduce((m, ch) => m + ch.filter(Boolean).length, 0), 0)
})

const sameAbbrev = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

export class BibleStore {
  private cache = new Map<string, Bible>() // insertion order = LRU order
  private builtInMeta = new Map<string, BibleMeta>()
  private inflight = new Map<string, Promise<Bible>>()
  private pending: { token: string; parsed: ParsedBible } | null = null // only the latest prepared import is kept

  constructor(
    private libraryDir: string,
    private builtInDir: string
  ) {}

  private get dir(): string {
    return path.join(this.libraryDir, 'bibles')
  }

  private importFile(id: string): string {
    if (!SAFE_ID.test(id)) throw new Error(`Invalid id: ${id}`)
    return path.join(this.dir, `${id}.json`)
  }

  private async overrides(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, 'overrides.json'), 'utf8'))
    } catch {
      return {}
    }
  }

  private async builtInFile(id: string): Promise<Bible | null> {
    try {
      const raw = await gunzipAsync(await fs.readFile(path.join(this.builtInDir, `${id}.json.gz`)))
      return { ...(JSON.parse(raw.toString('utf8')) as Bible), id, builtIn: true }
    } catch {
      return null
    }
  }

  private async builtInMetas(): Promise<BibleMeta[]> {
    const out: BibleMeta[] = []
    const ov = await this.overrides()
    for (const id of BUILT_IN_IDS) {
      let m = this.builtInMeta.get(id)
      if (!m) {
        const b = await this.builtInFile(id)
        if (!b) continue
        this.builtInMeta.set(id, (m = metaOf(b)))
      }
      out.push(ov[id] ? { ...m, abbrev: ov[id] } : m)
    }
    return out
  }

  private async importMetas(): Promise<BibleMeta[]> {
    let files: string[]
    try {
      files = (await fs.readdir(this.dir)).filter((f) => f.endsWith('.json') && f !== 'overrides.json')
    } catch {
      return []
    }
    const out: BibleMeta[] = []
    for (const f of files) {
      try {
        const j = JSON.parse(await fs.readFile(path.join(this.dir, f), 'utf8')) as ImportFile
        if (j.meta) out.push(j.meta)
      } catch {
        // skip corrupt files
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  async list(): Promise<BibleMeta[]> {
    return [...(await this.builtInMetas()), ...(await this.importMetas())]
  }

  private remember(b: Bible): void {
    this.cache.delete(b.id)
    this.cache.set(b.id, b)
    while (this.cache.size > LRU_SIZE) this.cache.delete(this.cache.keys().next().value as string)
  }

  private async load(id: string): Promise<Bible> {
    const hit = this.cache.get(id)
    if (hit) {
      this.remember(hit)
      return hit
    }
    let p = this.inflight.get(id)
    if (!p) {
      p = this.readBible(id).then((b) => {
        if (this.inflight.get(id) === p) this.remember(b)
        return b
      })
      this.inflight.set(id, p)
      const clear = (): void => {
        if (this.inflight.get(id) === p) this.inflight.delete(id)
      }
      p.then(clear, clear)
    }
    return p
  }

  private async readBible(id: string): Promise<Bible> {
    let bible: Bible | null = null
    if (BUILT_IN_IDS.includes(id)) {
      bible = await this.builtInFile(id)
      if (bible) {
        const ab = (await this.overrides())[id]
        if (ab) bible.abbrev = ab
      }
    } else if (SAFE_ID.test(id)) {
      try {
        bible = (JSON.parse(await fs.readFile(this.importFile(id), 'utf8')) as ImportFile).bible
      } catch {
        bible = null
      }
    }
    if (!bible) throw new Error(`Bible not found: ${id}`)
    return bible
  }

  private invalidate(id: string): void {
    this.cache.delete(id)
    this.inflight.delete(id)
  }

  /** Drop all in-memory state (e.g. after a backup restore replaced the files on disk) */
  reset(): void {
    this.cache.clear()
    this.builtInMeta.clear()
    this.inflight.clear()
    this.pending = null
  }

  cancelImport(token: string): void {
    if (this.pending?.token === token) this.pending = null
  }

  async passage(bibleId: string, refText: string): Promise<Passage | { error: string }> {
    const ref = parseReference(refText)
    if ('error' in ref) return ref
    try {
      return getPassage(await this.load(bibleId), ref)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }

  async search(bibleId: string, query: string): Promise<PassageVerse[]> {
    return searchBible(await this.load(bibleId), query)
  }

  async prepareImport(paths: string[]): Promise<ImportPreview | { error: string }> {
    let parsed: ParsedBible
    try {
      parsed = await parseInWorker(paths)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
    const token = randomUUID()
    this.pending = { token, parsed }
    const probe = metaOf({ ...parsed, id: '', builtIn: false })
    const existing = (await this.importMetas()).find((m) => sameAbbrev(m.abbrev, parsed.abbrev)) ?? null
    return {
      token,
      name: parsed.name,
      abbrev: parsed.abbrev,
      source: parsed.source,
      bookCount: probe.bookCount,
      chapterCount: parsed.books.reduce((n, b) => n + b.chapters.filter((c) => c.some(Boolean)).length, 0),
      verseCount: probe.verseCount,
      skipped: parsed.skipped,
      replaceCandidate: existing
    }
  }

  async commitImport(token: string, opts: { name: string; abbrev: string; replaceId: string | null }): Promise<BibleMeta> {
    const parsed = this.pending?.token === token ? this.pending.parsed : null
    if (!parsed) throw new Error('This import has expired or was cancelled. Please choose the file again.')
    let id: string
    if (opts.replaceId) {
      const target = (await this.importMetas()).find((m) => m.id === opts.replaceId)
      if (!target) throw new Error('The Bible to replace no longer exists')
      id = target.id
    } else {
      id = randomUUID()
    }
    const bible: Bible = {
      id,
      name: opts.name.trim() || parsed.name,
      abbrev: opts.abbrev.trim() || parsed.abbrev,
      builtIn: false,
      source: parsed.source,
      books: parsed.books
    }
    const meta = metaOf(bible)
    await fs.mkdir(this.dir, { recursive: true })
    await writeAtomic(this.importFile(id), JSON.stringify({ meta, bible } satisfies ImportFile))
    this.pending = null
    this.invalidate(id)
    return meta
  }

  async update(id: string, patch: { name?: string; abbrev?: string }): Promise<BibleMeta> {
    const abbrev = patch.abbrev?.trim()
    const name = patch.name?.trim()
    if (BUILT_IN_IDS.includes(id)) {
      const metas = await this.builtInMetas()
      const cur = metas.find((m) => m.id === id)
      if (!cur) throw new Error(`Bible not found: ${id}`)
      if (abbrev) {
        const ov = await this.overrides()
        ov[id] = abbrev
        await fs.mkdir(this.dir, { recursive: true })
        await writeAtomic(path.join(this.dir, 'overrides.json'), JSON.stringify(ov, null, 2))
        const cached = this.cache.get(id)
        if (cached) cached.abbrev = abbrev
        this.inflight.delete(id)
      }
      return { ...cur, abbrev: abbrev || cur.abbrev } // built-in names are fixed
    }
    const file = this.importFile(id)
    let j: ImportFile
    try {
      j = JSON.parse(await fs.readFile(file, 'utf8')) as ImportFile
    } catch {
      throw new Error(`Bible not found: ${id}`)
    }
    if (name) j.bible.name = j.meta.name = name
    if (abbrev) j.bible.abbrev = j.meta.abbrev = abbrev
    await writeAtomic(file, JSON.stringify(j))
    this.invalidate(id)
    return j.meta
  }

  async remove(id: string): Promise<void> {
    if (BUILT_IN_IDS.includes(id)) throw new Error('Built-in Bibles can’t be deleted')
    const file = this.importFile(id)
    await fs.rm(file, { force: true })
    this.invalidate(id)
  }
}
