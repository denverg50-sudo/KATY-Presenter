import { looksLikeFreeShow } from './parse-freeshow'
import { decodeText } from './parse-text-songs'

export type SongFormat = 'freeshow' | 'openlyrics' | 'opensong' | 'chordpro' | 'usr' | 'text'

/** Work out which song format a file is, or null when it is not a song file we know. */
export function detectSongFormat(buf: Buffer, fileName: string): SongFormat | null {
  const utf16 = buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))
  if (!utf16 && buf.subarray(0, 1024).includes(0)) return null
  const text = decodeText(buf)
  const trimmed = text.trimStart()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      if (looksLikeFreeShow(JSON.parse(trimmed))) return 'freeshow'
      return null
    } catch {
      /* not JSON: ChordPro starts with '{' and USR with '[' */
    }
  }

  const xml = trimmed.replace(/^(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|\s)+/i, '')
  const root = xml.match(/^<([A-Za-z_][\w.-]*)([^>]*)>/)
  if (root && root[1].toLowerCase() === 'song') {
    if (/openlyrics\.info/i.test(root[2]) || /<lyrics[^>]*>\s*<verse/i.test(xml)) return 'openlyrics'
    if (/<lyrics[\s>]/i.test(xml)) return 'opensong'
    return null
  }

  if (/\{\s*(title\b|t:|start_of_|sov\b)/i.test(text)) return 'chordpro'
  if (/^\s*\[File\]/im.test(text) && /^\s*Words=/im.test(text)) return 'usr'

  if (/\.txt$/i.test(fileName)) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length >= 3) return 'text'
  }
  return null
}
