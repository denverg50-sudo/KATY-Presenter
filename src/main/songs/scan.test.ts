import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { collectFiles, parseSongFiles } from './scan'
import { parseSongsInBackground } from './background'

const fx = path.join(__dirname, 'fixtures')
let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'songscan-'))
  await fs.copyFile(path.join(fx, 'freeshow', 'pair.show'), path.join(dir, 'pair.show'))
  await fs.copyFile(path.join(fx, 'openlyrics.xml'), path.join(dir, 'openlyrics.xml'))
  await fs.copyFile(path.join(fx, 'song.cho'), path.join(dir, 'song.cho'))
  await fs.writeFile(path.join(dir, '.DS_Store'), 'x')
  await fs.writeFile(path.join(dir, 'README.txt'), 'Just a readme')
  await fs.writeFile(path.join(dir, 'settings.json'), '{"theme":"dark"}')
  await fs.writeFile(path.join(dir, 'binary.pro'), Buffer.from([1, 2, 0, 0, 3, 0, 9]))
  await fs.writeFile(path.join(dir, 'bad.show'), '{"slides":{},"layouts":')
  await fs.writeFile(path.join(dir, 'notshow.show'), '{"hello":1}')
  await fs.mkdir(path.join(dir, 'sub'))
  await fs.copyFile(path.join(fx, 'opensong.xml'), path.join(dir, 'sub', 'nested.xml'))
})
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

describe('collectFiles', () => {
  it('walks folders, filters extensions, skips dot-files', async () => {
    const { files, truncated } = await collectFiles([dir, dir])
    expect(truncated).toBe(false)
    const names = files.map((f) => path.relative(dir, f))
    expect(names).toContain(path.join('sub', 'nested.xml'))
    expect(names).not.toContain('.DS_Store')
    expect(new Set(names).size).toBe(names.length)
    expect(files).toEqual([...files].sort())
  })
  it('sets truncated at the cap', async () => {
    const r = await collectFiles([dir], 3)
    expect(r.files).toHaveLength(3)
    expect(r.truncated).toBe(true)
  })
  it('does not follow symlinked folders or enter node_modules', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'songout-'))
    await fs.writeFile(path.join(outside, 'x.txt'), 'a\nb\nc\n')
    await fs.symlink(outside, path.join(dir, 'link'))
    await fs.mkdir(path.join(dir, 'node_modules'))
    await fs.writeFile(path.join(dir, 'node_modules', 'y.txt'), 'a\nb\nc\n')
    const { files } = await collectFiles([dir])
    expect(files.some((f) => f.includes('link') || f.includes('node_modules'))).toBe(false)
    await fs.rm(outside, { recursive: true, force: true })
  })
})

describe('parseSongFiles', () => {
  it('parses songs, ignores non-songs, fails broken ones', async () => {
    const r = await parseSongFiles([dir])
    expect(r.songs.map((s) => s.file).sort()).toEqual(['openlyrics.xml', 'pair.show', 'song.cho', 'sub/nested.xml'])
    expect([...r.ignored].sort()).toEqual(['README.txt', 'binary.pro', 'settings.json'])
    expect(r.failed.find((f) => f.file === 'bad.show')?.reason).toBe('Not valid FreeShow JSON')
    expect(r.failed.find((f) => f.file === 'notshow.show')?.reason).toBe('Not a FreeShow show file')
    expect(r.failed).toHaveLength(2)
    expect(r.fileCount).toBe(9)
    expect(r.truncated).toBe(false)
  })
  it('lists picked files of unsupported kinds as ignored and counts them', async () => {
    await fs.writeFile(path.join(dir, 'photo.png'), 'x')
    await fs.writeFile(path.join(dir, 'notes.docx'), 'x')
    const r = await parseSongFiles([path.join(dir, 'song.cho'), path.join(dir, 'photo.png'), path.join(dir, 'notes.docx')])
    expect(r.songs.map((s) => s.file)).toEqual(['song.cho'])
    expect(r.ignored).toEqual(['photo.png', 'notes.docx'])
    expect(r.fileCount).toBe(3)
    // inside a picked folder, unsupported files stay out of the count and the list
    const f = await parseSongFiles([dir])
    expect(f.ignored).not.toContain('photo.png')
    expect(f.fileCount).toBe(9)
  })
  it('uses the base name for a picked file', async () => {
    const r = await parseSongFiles([path.join(dir, 'song.cho')])
    expect(r.songs[0].file).toBe('song.cho')
  })
  it('fails files over 10 MB and unreadable files without throwing', async () => {
    await fs.writeFile(path.join(dir, 'huge.txt'), Buffer.alloc(10 * 1024 * 1024 + 1, 97))
    await fs.writeFile(path.join(dir, 'locked.txt'), 'a\nb\nc\n')
    await fs.chmod(path.join(dir, 'locked.txt'), 0)
    const r = await parseSongFiles([dir])
    expect(r.failed.find((f) => f.file === 'huge.txt')?.reason).toBe('File is too large to be a song')
    // chmod 0 can't block reading on Windows, and root ignores it
    if (process.platform !== 'win32' && process.getuid?.() !== 0) expect(r.failed.find((f) => f.file === 'locked.txt')).toBeTruthy()
  })
  it('parseSongsInBackground runs in-process under Vitest', async () => {
    expect((await parseSongsInBackground([dir])).songs).toHaveLength(4)
  })
})
