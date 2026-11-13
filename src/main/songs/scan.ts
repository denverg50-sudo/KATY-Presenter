import { promises as fs } from 'fs'
import path from 'path'
import type { ImportedSong } from '@shared/songImport'
import { decodeXml } from '../bible/parse-xml'
import { detectSongFormat } from './detect-song'
import { parseFreeShow } from './parse-freeshow'
import { parseOpenLyrics } from './parse-openlyrics'
import { parseOpenSong } from './parse-opensong'
import { decodeText, parseChordPro, parsePlainText, parseSongSelectUsr } from './parse-text-songs'

export const SONG_EXTENSIONS = ['.show', '.json', '.xml', '.cho', '.chopro', '.chordpro', '.pro', '.usr', '.txt']

const MAX_FILE_BYTES = 10 * 1024 * 1024

export interface ParseResult {
  songs: ImportedSong[]
  /** file names (relative to the picked folder) that are not recognised songs */
  ignored: string[]
  failed: { file: string; reason: string }[]
  fileCount: number
  truncated: boolean
}

interface Found {
  abs: string
  /** path relative to the picked root, or the base name for a picked file */
  rel: string
}

const hidden = (name: string): boolean => name.startsWith('.') || name === 'node_modules'
const isSongName = (name: string): boolean => !name.startsWith('.') && SONG_EXTENSIONS.includes(path.extname(name).toLowerCase())

async function walk(paths: string[], cap: number): Promise<{ found: Found[]; truncated: boolean }> {
  const seen = new Set<string>()
  const found: Found[] = []
  let truncated = false

  const add = (abs: string, rel: string): boolean => {
    if (seen.has(abs)) return true
    if (found.length >= cap) {
      truncated = true
      return false
    }
    seen.add(abs)
    found.push({ abs, rel })
    return true
  }

  // Returns false once the cap is hit, so callers stop early.
  async function visit(dir: string, rel: string): Promise<boolean> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return true
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (hidden(e.name) || e.isSymbolicLink()) continue
      const abs = path.join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!(await visit(abs, r))) return false
      } else if (e.isFile() && isSongName(e.name)) {
        if (!add(abs, r)) return false
      }
    }
    return true
  }

  for (const p of paths) {
    let st
    try {
      st = await fs.stat(p) // a picked path may itself be a link; that is the user's choice
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (!(await visit(p, ''))) break
    } else if (st.isFile() && isSongName(path.basename(p))) {
      if (!add(p, path.basename(p))) break
    }
  }
  found.sort((a, b) => (a.abs < b.abs ? -1 : a.abs > b.abs ? 1 : 0))
  return { found, truncated }
}

/** Expand folders recursively, keep song-like extensions, skip hidden entries and symlinks, de-duplicate and sort. */
export async function collectFiles(paths: string[], cap = 5000): Promise<{ files: string[]; truncated: boolean }> {
  const { found, truncated } = await walk(paths, cap)
  return { files: found.map((f) => f.abs), truncated }
}

const firstLine = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e)
  return m.split('\n')[0].slice(0, 160) || 'Could not be read'
}

/** Read, detect and parse every song file. Per-file problems never throw. */
export async function parseSongFiles(paths: string[]): Promise<ParseResult> {
  const { found, truncated } = await walk(paths, 5000)
  const result: ParseResult = { songs: [], ignored: [], failed: [], fileCount: found.length, truncated }

  for (const { abs, rel } of found) {
    const isShow = path.extname(abs).toLowerCase() === '.show'
    try {
      const st = await fs.stat(abs)
      if (st.size > MAX_FILE_BYTES) {
        result.failed.push({ file: rel, reason: 'File is too large to be a song' })
        continue
      }
      const buf = await fs.readFile(abs)
      const format = detectSongFormat(buf, path.basename(abs))
      if (!format) {
        if (isShow) {
          let valid = true
          try {
            JSON.parse(decodeText(buf).trimStart())
          } catch {
            valid = false
          }
          result.failed.push({ file: rel, reason: valid ? 'Not a FreeShow show file' : 'Not valid FreeShow JSON' })
        } else {
          result.ignored.push(rel)
        }
        continue
      }
      switch (format) {
        case 'freeshow':
          result.songs.push(parseFreeShow(decodeText(buf), rel))
          break
        case 'openlyrics':
          result.songs.push(parseOpenLyrics(decodeXml(buf), rel))
          break
        case 'opensong':
          result.songs.push(parseOpenSong(decodeXml(buf), rel))
          break
        case 'chordpro':
          result.songs.push(parseChordPro(decodeText(buf), rel))
          break
        case 'usr':
          result.songs.push(parseSongSelectUsr(decodeText(buf), rel))
          break
        case 'text':
          result.songs.push(parsePlainText(decodeText(buf), rel))
          break
      }
    } catch (e) {
      result.failed.push({ file: rel, reason: firstLine(e) })
    }
  }
  return result
}
