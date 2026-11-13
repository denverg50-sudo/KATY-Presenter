import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { Storage } from '../storage'
import { SongImporter } from './importer'
import { selectForImport } from '../../shared/songImport'
import type { ImportedSong } from '../../shared/songImport'
import type { Song } from '../../shared/types'
import type { ParseResult } from './scan'
import { sampleSongs } from '../../shared/defaults'

const song = (title: string, over: Partial<ImportedSong> = {}): ImportedSong => ({
  title, author: 'A', ccli: '', copyright: '', lyrics: `[Verse 1]\n${title}`, arrangement: '',
  source: 'FreeShow', category: 'Hymns', notes: [], file: `${title}.show`, ...over
})
const result = (songs: ImportedSong[]): ParseResult => ({ songs, ignored: ['x.png'], failed: [], fileCount: songs.length, truncated: false })

let dir: string
let storage: Storage
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'songimp-'))
  storage = new Storage(dir)
  await storage.init()
  for (const s of await storage.list<Song>('songs')) await storage.remove('songs', s.id)
  await storage.save('songs', { id: 'existing', title: 'Amazing Grace', author: '', ccli: '', copyright: '', lyrics: 'x', arrangement: '', themeId: '', updatedAt: 1 })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(dir, { recursive: true, force: true })
})

const EXPIRED = 'This import has expired or was cancelled. Please choose the files again.'

describe('SongImporter', () => {
  it('marks library duplicates in the preview', async () => {
    const imp = new SongImporter(storage, async () => result([song('amazing grace!'), song('How Great')]))
    const p = await imp.prepare(['/x'])
    expect(p.items.map((i) => i.libraryDuplicate)).toEqual([true, false])
    expect(p.ignored).toEqual(['x.png'])
  })

  it('selectForImport keeps the ticked item when an unticked category has the same title', () => {
    const imp = new SongImporter(storage, async () => result([song('Same', { category: 'Old' }), song('Same', { category: 'New' })]))
    return imp.prepare(['/x']).then((p) => {
      const sel = selectForImport(p.items, new Set<string | null>(['New']))
      expect(sel.importKeys).toEqual([p.items[1].key])
      expect(sel.duplicates).toEqual([])
    })
  })

  it('selectForImport handles null bucket, other sources and duplicates', () => {
    const mk = (key: string, title: string, source: string, category: string | null, dup = false) => ({ key, title, file: key, source, category, libraryDuplicate: dup, notes: [] })
    const items = [mk('a', 'One', 'FreeShow', null), mk('b', 'Two', 'OpenSong', null), mk('c', 'two', 'FreeShow', 'X'), mk('d', 'Three', 'FreeShow', 'X', true)]
    const sel = selectForImport(items, new Set<string | null>(['X']))
    expect(sel.importKeys).toEqual(['b'])
    expect(sel.duplicates.map((i) => i.key)).toEqual(['c', 'd'])
    expect(selectForImport(items, new Set<string | null>([null])).importKeys).toEqual(['a', 'b'])
  })

  it('commit writes songs with source, skips library and in-set duplicates, ignores unknown keys', async () => {
    const imp = new SongImporter(storage, async () => result([song('Amazing Grace'), song('How Great'), song('how great'), song('Third')]))
    const p = await imp.prepare(['/x'])
    const r = await imp.commit(p.token, ['0', '1', '2', '3', 'nope'])
    expect(r).toEqual({ imported: 2, skipped: 2 })
    const all = await storage.list<Song>('songs')
    expect(all.map((s) => s.title).sort()).toEqual(['Amazing Grace', 'How Great', 'Third'])
    const hg = all.find((s) => s.title === 'How Great')!
    expect(hg.source).toBe('FreeShow')
    expect(hg.themeId).toBe('')
    expect(hg.id).not.toBe('existing')
    await expect(imp.commit(p.token, ['1'])).rejects.toThrow(EXPIRED)
  })

  it('rolls back everything when a write fails and keeps the batch for retry', async () => {
    const imp = new SongImporter(storage, async () => result([song('A1'), song('B2'), song('C3'), song('D4')]))
    const p = await imp.prepare(['/x'])
    const real = storage.save.bind(storage)
    let n = 0
    const spy = vi.spyOn(storage, 'save').mockImplementation(async (k, item) => {
      if (++n === 3) throw new Error('disk full')
      return real(k, item)
    })
    await expect(imp.commit(p.token, ['0', '1', '2', '3'])).rejects.toThrow('Import failed — nothing was added: disk full')
    expect((await storage.list<Song>('songs')).map((s) => s.id)).toEqual(['existing'])
    spy.mockRestore()
    expect(await imp.commit(p.token, ['0', '1'])).toEqual({ imported: 2, skipped: 0 })
  })

  it('reports songs that may remain when a rollback removal fails', async () => {
    const imp = new SongImporter(storage, async () => result([song('A1'), song('B2'), song('C3'), song('D4')]))
    const p = await imp.prepare(['/x'])
    const real = storage.save.bind(storage)
    let n = 0
    vi.spyOn(storage, 'save').mockImplementation(async (k, item) => {
      if (++n === 3) throw new Error('disk full')
      return real(k, item)
    })
    vi.spyOn(storage, 'remove').mockRejectedValue(new Error('locked'))
    await expect(imp.commit(p.token, ['0', '1', '2', '3'])).rejects.toThrow(
      'Import failed — 3 songs may have been added before the error: disk full'
    )
  })

  it('cancel and a newer prepare invalidate the token', async () => {
    const imp = new SongImporter(storage, async () => result([song('A1')]))
    const p = await imp.prepare(['/x'])
    imp.cancel(p.token)
    await expect(imp.commit(p.token, ['0'])).rejects.toThrow(EXPIRED)
    const p2 = await imp.prepare(['/x'])
    await imp.prepare(['/x'])
    await expect(imp.commit(p2.token, ['0'])).rejects.toThrow(EXPIRED)
  })

  it('rejects a concurrent commit on the same token without duplicating songs', async () => {
    const imp = new SongImporter(storage, async () => result([song('A1'), song('B2')]))
    const p = await imp.prepare(['/x'])
    const r = await Promise.allSettled([imp.commit(p.token, ['0', '1']), imp.commit(p.token, ['0', '1'])])
    expect(r.map((x) => x.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rej = r.find((x) => x.status === 'rejected') as PromiseRejectedResult
    expect(rej.reason.message).toBe('An import is already in progress.')
    expect((await storage.list<Song>('songs')).filter((s) => s.title === 'A1')).toHaveLength(1)
  })
})

describe('SongImporter and the sample song', () => {
  const sample = sampleSongs()[0]
  beforeEach(async () => {
    await storage.remove('songs', 'existing')
    await storage.save('songs', sample)
  })
  const titles = async (): Promise<string[]> => (await storage.list<Song>('songs')).map((s) => s.title).sort()
  const ids = async (): Promise<string[]> => (await storage.list<Song>('songs')).map((s) => s.id)

  it('an unedited sample is not a library duplicate in prepare', async () => {
    const imp = new SongImporter(storage, async () => result([song('Amazing Grace'), song('Other')]))
    const p = await imp.prepare(['/x'])
    expect(p.items.map((i) => i.libraryDuplicate)).toEqual([false, false])
  })

  it('an edited sample still counts as a duplicate', async () => {
    await storage.save('songs', { ...sample, lyrics: sample.lyrics + '\n\nOur own verse' })
    const imp = new SongImporter(storage, async () => result([song('Amazing Grace')]))
    const p = await imp.prepare(['/x'])
    expect(p.items[0].libraryDuplicate).toBe(true)
    expect(await imp.commit(p.token, ['0'])).toEqual({ imported: 0, skipped: 1 })
    expect(await ids()).toEqual([sample.id])
  })

  it('importing the same title replaces the unedited sample', async () => {
    const imp = new SongImporter(storage, async () => result([song('amazing grace!'), song('Other')]))
    const p = await imp.prepare(['/x'])
    expect(await imp.commit(p.token, ['0', '1'])).toEqual({ imported: 2, skipped: 0 })
    expect(await titles()).toEqual(['Other', 'amazing grace!'])
    expect(await ids()).not.toContain(sample.id)
  })

  it('keeps the sample when no imported song has its title', async () => {
    const imp = new SongImporter(storage, async () => result([song('Other')]))
    const p = await imp.prepare(['/x'])
    await imp.commit(p.token, ['0'])
    expect(await ids()).toContain(sample.id)
  })

  it('keeps the sample, and the import, when removing the sample fails', async () => {
    const imp = new SongImporter(storage, async () => result([song('Amazing Grace')]))
    const p = await imp.prepare(['/x'])
    vi.spyOn(storage, 'remove').mockRejectedValue(new Error('locked'))
    expect(await imp.commit(p.token, ['0'])).toEqual({ imported: 1, skipped: 0 })
    expect(await titles()).toEqual(['Amazing Grace', 'Amazing Grace'])
    expect(await ids()).toContain(sample.id)
  })
})
