import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { Storage } from './storage'
import type { Song } from '../shared/types'

let root: string
let store: Storage

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'katy-'))
  store = new Storage(root)
  await store.init()
})

describe('Storage', () => {
  it('seeds starter themes, a sample song and settings on first run', async () => {
    expect((await store.list('themes')).length).toBeGreaterThanOrEqual(4)
    expect((await store.list<Song>('songs'))[0].title).toBe('Amazing Grace')
    expect((await store.getSettings()).defaultThemeId).toBe('theme-classic')
  })

  it('does not reseed after the user deletes the sample', async () => {
    await store.remove('songs', 'song-amazing-grace')
    await new Storage(root).init()
    expect(await store.list('songs')).toHaveLength(0)
  })

  it('saves, lists and removes items', async () => {
    await store.save('services', { id: 'svc1', name: 'Sunday' })
    expect(await store.list('services')).toEqual([{ id: 'svc1', name: 'Sunday' }])
    await store.remove('services', 'svc1')
    expect(await store.list('services')).toEqual([])
  })

  it('rejects ids that could escape the folder', async () => {
    await expect(store.save('songs', { id: '../evil' })).rejects.toThrow()
  })

  it('skips corrupt files', async () => {
    writeFileSync(path.join(root, 'songs', 'bad.json'), '{oops')
    expect((await store.list('songs')).length).toBe(1)
  })

  it('imports media with unique names and blocks path traversal', async () => {
    const src = path.join(root, 'bg.png')
    writeFileSync(src, 'x')
    expect(await store.importMedia([src, src])).toEqual(['bg.png', 'bg (2).png'])
    expect(store.mediaPath('bg.png')).toBe(path.join(root, 'media', 'bg.png'))
    expect(store.mediaPath('../settings.json')).toBeNull()
  })

  it('round-trips a backup zip', async () => {
    const zip = path.join(root, 'backup.zip')
    await store.save('songs', { id: 'extra', title: 'Extra' })
    await store.exportZip(zip)
    const other = new Storage(mkdtempSync(path.join(tmpdir(), 'katy-')))
    await other.init()
    await other.remove('songs', 'song-amazing-grace')
    await other.importZip(zip)
    expect(readdirSync(path.join(other.root, 'songs')).sort()).toEqual(['extra.json', 'song-amazing-grace.json'])
  })
})
