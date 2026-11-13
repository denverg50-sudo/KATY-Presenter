import { randomUUID } from 'crypto'
import type { Storage } from '../storage'
import type { Song, SongImportItem, SongImportPreview } from '../../shared/types'
import { normalizeTitle, type ImportedSong } from '../../shared/songImport'
import { sampleSongs } from '../../shared/defaults'
import type { ParseResult } from './scan'

const SAMPLE = sampleSongs()[0]
const SAMPLE_TITLE = normalizeTitle(SAMPLE.title)

/** The built-in sample song, still exactly as shipped: it never blocks an import. */
export function isUneditedSample(s: Song): boolean {
  return s.id === SAMPLE.id && s.title === SAMPLE.title && s.lyrics === SAMPLE.lyrics && s.arrangement === SAMPLE.arrangement
}

/** Normalised titles of library songs, leaving out the unedited sample. */
function libraryTitles(songs: Song[]): Set<string> {
  return new Set(songs.filter((s) => !isUneditedSample(s)).map((s) => normalizeTitle(s.title)))
}

const EXPIRED = 'This import has expired or was cancelled. Please choose the files again.'

export class SongImporter {
  private pending: { token: string; songs: Map<string, ImportedSong>; committing: boolean } | null = null // only the latest batch is kept

  constructor(
    private storage: Storage,
    private parse: (paths: string[]) => Promise<ParseResult>
  ) {}

  async prepare(paths: string[]): Promise<SongImportPreview> {
    const result = await this.parse(paths)
    const library = libraryTitles(await this.storage.list<Song>('songs'))
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
    this.pending = { token, songs, committing: false }
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
    const batch = this.pending
    if (!batch || batch.token !== token) throw new Error(EXPIRED)
    if (batch.committing) throw new Error('An import is already in progress.')
    batch.committing = true // claimed synchronously, before any await
    try {
      return await this.doCommit(batch, keys)
    } finally {
      batch.committing = false
    }
  }

  private async doCommit(
    batch: { songs: Map<string, ImportedSong> },
    keys: string[]
  ): Promise<{ imported: number; skipped: number }> {
    const { songs } = batch
    const library = await this.storage.list<Song>('songs')
    const seen = libraryTitles(library)
    const sample = library.find(isUneditedSample)
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
      let left = 0
      for (const id of written) {
        await this.storage.remove('songs', id).catch(() => {
          left++
        })
      }
      const reason = e instanceof Error ? e.message : String(e)
      throw new Error(
        left
          ? `Import failed — ${left} ${left === 1 ? 'song' : 'songs'} may have been added before the error: ${reason}`
          : `Import failed — nothing was added: ${reason}`
      )
    }
    // the imported copy replaces the untouched sample; best effort, the new songs are already saved
    if (sample && toWrite.some((s) => normalizeTitle(s.title) === SAMPLE_TITLE)) {
      await this.storage.remove('songs', sample.id).catch(() => {})
    }
    if (this.pending === batch) this.pending = null
    return { imported: toWrite.length, skipped }
  }

  cancel(token: string): void {
    if (this.pending?.token === token) this.pending = null
  }
}
