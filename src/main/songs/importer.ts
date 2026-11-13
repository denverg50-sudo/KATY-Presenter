import { randomUUID } from 'crypto'
import type { Storage } from '../storage'
import type { Song, SongImportItem, SongImportPreview } from '../../shared/types'
import { normalizeTitle, type ImportedSong } from '../../shared/songImport'
import type { ParseResult } from './scan'

const EXPIRED = 'This import has expired or was cancelled. Please choose the files again.'

export class SongImporter {
  private pending: { token: string; songs: Map<string, ImportedSong> } | null = null // only the latest batch is kept

  constructor(
    private storage: Storage,
    private parse: (paths: string[]) => Promise<ParseResult>
  ) {}

  async prepare(paths: string[]): Promise<SongImportPreview> {
    const result = await this.parse(paths)
    const library = new Set((await this.storage.list<Song>('songs')).map((s) => normalizeTitle(s.title)))
    const token = randomUUID()
    const songs = new Map<string, ImportedSong>()
    const items: SongImportItem[] = result.songs.map((s, i) => {
      const key = String(i)
      songs.set(key, s)
      return {
        key,
        title: s.title,
        file: s.file,
        source: s.source,
        category: s.category,
        libraryDuplicate: library.has(normalizeTitle(s.title)),
        notes: s.notes
      }
    })
    this.pending = { token, songs }
    return {
      token,
      fileCount: result.fileCount,
      truncated: result.truncated,
      items,
      ignored: result.ignored,
      failed: result.failed
    }
  }

  async commit(token: string, keys: string[]): Promise<{ imported: number; skipped: number }> {
    if (!this.pending || this.pending.token !== token) throw new Error(EXPIRED)
    const { songs } = this.pending
    const seen = new Set((await this.storage.list<Song>('songs')).map((s) => normalizeTitle(s.title)))
    const toWrite: Song[] = []
    let skipped = 0
    for (const key of new Set(keys)) {
      const s = songs.get(key)
      if (!s) continue // unknown keys are ignored
      const norm = normalizeTitle(s.title)
      if (seen.has(norm)) {
        skipped++
        continue
      }
      seen.add(norm)
      toWrite.push({
        id: randomUUID(),
        title: s.title,
        author: s.author,
        ccli: s.ccli,
        copyright: s.copyright,
        lyrics: s.lyrics,
        arrangement: s.arrangement,
        themeId: '',
        updatedAt: Date.now(),
        source: s.source
      })
    }
    const written: string[] = []
    try {
      for (const song of toWrite) {
        written.push(song.id) // record first: a failed save may leave a partial file
        await this.storage.save('songs', song)
      }
    } catch (e) {
      for (const id of written) await this.storage.remove('songs', id).catch(() => {})
      throw new Error(`Import failed — nothing was added: ${e instanceof Error ? e.message : String(e)}`)
    }
    this.pending = null
    return { imported: toWrite.length, skipped }
  }

  cancel(token: string): void {
    if (this.pending?.token === token) this.pending = null
  }
}
