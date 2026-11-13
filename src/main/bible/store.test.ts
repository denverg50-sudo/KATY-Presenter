import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { gzipSync } from 'zlib'
import { BibleStore } from './store'
import type { ImportPreview } from '../../shared/types'

const fx = (n: string): string => path.join(__dirname, 'fixtures', n)
let lib: string
let builtIn: string
let store: BibleStore

beforeEach(() => {
  lib = mkdtempSync(path.join(tmpdir(), 'bible-lib-'))
  builtIn = mkdtempSync(path.join(tmpdir(), 'bible-bi-'))
  const kjv = { id: 'kjv', name: 'King James', abbrev: 'KJV', builtIn: true, source: 'Built-in', books: [{ num: 43, chapters: [[], [], ['For God so loved.', 'Second']] }] }
  writeFileSync(path.join(builtIn, 'kjv.json.gz'), gzipSync(JSON.stringify(kjv)))
  store = new BibleStore(lib, builtIn)
})

const prep = async (f = 'zefania.xml'): Promise<ImportPreview> => {
  const p = await store.prepareImport([fx(f)])
  if ('error' in p) throw new Error(p.error)
  return p
}

describe('BibleStore', () => {
  it('lists built-ins with counts', async () => {
    const l = await store.list()
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ id: 'kjv', builtIn: true, bookCount: 1, verseCount: 2 })
  })

  it('previews, commits, lists and looks up a passage', async () => {
    const p = await prep()
    expect(p.bookCount).toBeGreaterThan(0)
    expect(p.verseCount).toBeGreaterThan(0)
    expect(p.replaceCandidate).toBeNull()
    const meta = await store.commitImport(p.token, { name: p.name, abbrev: p.abbrev, replaceId: null })
    expect((await store.list()).map((m) => m.id)).toEqual(['kjv', meta.id])
    const r = await store.passage(meta.id, 'John 3:16')
    expect('error' in r).toBe(false)
    expect((r as { verses: { text: string }[] }).verses[0].text).toContain('Giver')
    expect((await store.search(meta.id, 'Giver')).length).toBe(1)
  })

  it('offers a replace candidate and keeps the id on replace', async () => {
    const a = await prep()
    const m1 = await store.commitImport(a.token, { name: a.name, abbrev: a.abbrev, replaceId: null })
    const b = await prep()
    expect(b.replaceCandidate?.id).toBe(m1.id)
    const m2 = await store.commitImport(b.token, { name: 'Renamed', abbrev: b.abbrev, replaceId: m1.id })
    expect(m2.id).toBe(m1.id)
    const l = (await store.list()).filter((m) => !m.builtIn)
    expect(l).toHaveLength(1)
    expect(l[0].name).toBe('Renamed')
  })

  it('rejects unknown or reused tokens', async () => {
    await expect(store.commitImport('nope', { name: 'x', abbrev: 'x', replaceId: null })).rejects.toThrow(/expired/)
    const p = await prep()
    await store.commitImport(p.token, { name: p.name, abbrev: p.abbrev, replaceId: null })
    await expect(store.commitImport(p.token, { name: 'x', abbrev: 'x', replaceId: null })).rejects.toThrow(/expired/)
  })

  it('refuses to delete built-ins, deletes imports, and rejects path escapes', async () => {
    await expect(store.remove('kjv')).rejects.toThrow('Built-in Bibles can’t be deleted')
    await expect(store.remove('../x')).rejects.toThrow(/Invalid id/)
    const p = await prep()
    const m = await store.commitImport(p.token, { name: p.name, abbrev: p.abbrev, replaceId: null })
    await store.remove(m.id)
    expect(existsSync(path.join(lib, 'bibles', `${m.id}.json`))).toBe(false)
    expect(await store.list()).toHaveLength(1)
  })

  it('renames built-in abbreviations via overrides.json', async () => {
    const m = await store.update('kjv', { abbrev: 'AV' })
    expect(m.abbrev).toBe('AV')
    expect(JSON.parse(readFileSync(path.join(lib, 'bibles', 'overrides.json'), 'utf8'))).toEqual({ kjv: 'AV' })
    expect((await new BibleStore(lib, builtIn).list())[0].abbrev).toBe('AV')
    const r = await new BibleStore(lib, builtIn).passage('kjv', 'John 3:1')
    expect((r as { abbrev: string }).abbrev).toBe('AV')
  })

  it('updates import name and abbrev', async () => {
    const p = await prep()
    const m = await store.commitImport(p.token, { name: p.name, abbrev: p.abbrev, replaceId: null })
    const u = await store.update(m.id, { name: 'Mine', abbrev: 'MN' })
    expect(u).toMatchObject({ name: 'Mine', abbrev: 'MN' })
    expect((await store.list()).find((x) => x.id === m.id)?.abbrev).toBe('MN')
  })

  it('gives friendly errors', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bible-bad-'))
    const txt = path.join(dir, 'notes.txt')
    writeFileSync(txt, 'hello there')
    expect(await store.prepareImport([txt])).toEqual({
      error: "This doesn't look like a Bible file. Supported: Zefania, OpenSong, OSIS, USFX, OpenLP (.sqlite or CSV)."
    })
    const csv = path.join(dir, 'v.csv')
    writeFileSync(csv, 'a,b')
    expect(await store.prepareImport([csv])).toEqual({ error: 'OpenLP CSV needs both the books file and the verses file' })
    const bad = path.join(dir, 'bad.xml')
    writeFileSync(bad, '<XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">a &nope; b</VERS></CHAPTER></XMLBIBLE>')
    const e1 = (await store.prepareImport([bad])) as { error: string }
    expect(e1.error).toMatch(/^Couldn't read "bad.xml": /)
    expect(e1.error).not.toContain('\n')
    const empty = path.join(dir, 'empty.xml')
    writeFileSync(empty, '<XMLBIBLE biblename="x"></XMLBIBLE>')
    expect(await store.prepareImport([empty])).toEqual({ error: 'No Bible books found in empty.xml' })
    const e2 = await store.prepareImport([path.join(dir, 'missing.xml')])
    expect((e2 as { error: string }).error).toMatch(/^Couldn't read "missing.xml"/)
    mkdirSync(path.join(dir, 'x'))
  })

  it('says a non-OpenLP sqlite is not an OpenLP database', async () => {
    const { createRequire } = await import('node:module')
    const initSqlJs = (await import('sql.js')).default
    const req = createRequire(import.meta.url)
    const SQL = await initSqlJs({ locateFile: () => req.resolve('sql.js/dist/sql-wasm.wasm') })
    const db = new SQL.Database()
    db.run('create table other (a)')
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'bible-sq-')), 'x.sqlite')
    writeFileSync(f, Buffer.from(db.export()))
    expect(await store.prepareImport([f])).toEqual({ error: "x.sqlite isn't an OpenLP Bible database" })
  })

  it('de-duplicates concurrent loads of the same Bible', async () => {
    const spy = vi.spyOn(store as unknown as { readBible: (id: string) => Promise<unknown> }, 'readBible')
    await Promise.all([store.passage('kjv', 'John 3:1'), store.passage('kjv', 'John 3:2'), store.search('kjv', 'Second')])
    expect(spy).toHaveBeenCalledTimes(1)
    await store.passage('kjv', 'John 3:1')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed load', async () => {
    const spy = vi.spyOn(store as unknown as { readBible: (id: string) => Promise<unknown> }, 'readBible')
    const r = await Promise.all([store.passage('zzz', 'John 3:1'), store.passage('zzz', 'John 3:1')])
    expect(r[0]).toHaveProperty('error')
    expect(spy).toHaveBeenCalledTimes(1)
    await store.passage('zzz', 'John 3:1')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('keeps only the latest prepared import and supports cancel', async () => {
    const a = await prep()
    const b = await prep('opensong.xml')
    await expect(store.commitImport(a.token, { name: 'x', abbrev: 'x', replaceId: null })).rejects.toThrow(/expired or was cancelled/)
    store.cancelImport(b.token)
    await expect(store.commitImport(b.token, { name: 'x', abbrev: 'x', replaceId: null })).rejects.toThrow(/expired or was cancelled/)
    const c = await prep()
    store.cancelImport('other')
    await expect(store.commitImport(c.token, { name: 'c', abbrev: 'c', replaceId: null })).resolves.toBeTruthy()
  })
})

describe('shipped built-ins', () => {
  it('serves John 3:16 from the real KJV', async () => {
    const real = new BibleStore(mkdtempSync(path.join(tmpdir(), 'bible-')), path.join(__dirname, '../../../resources/bibles'))
    const r = await real.passage('kjv', 'John 3:16')
    expect(JSON.stringify(r)).toContain('For God so loved the world')
    expect('error' in r).toBe(false)
  })
})
