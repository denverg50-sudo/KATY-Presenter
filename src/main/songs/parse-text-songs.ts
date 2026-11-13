import { assembleSong, type ImportedSong, type RawSection } from '@shared/songImport'

/** Decode file bytes to text: BOMs, UTF-16, Windows-1252 fallback, `\n` line endings. */
export function decodeText(buf: Buffer): string {
  let text: string
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.subarray(2).toString('utf16le')
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const body = Buffer.from(buf.subarray(2))
    text = body.subarray(0, body.length - (body.length % 2)).swap16().toString('utf16le')
  } else {
    const body = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(body)
    } catch {
      text = new TextDecoder('windows-1252').decode(body)
    }
  }
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

const baseName = (file: string): string => file.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')

/** Collects lines into slides (a blank line ends a slide). */
class SlideBuilder {
  slides: string[] = []
  private lines: string[] = []
  line(l: string): void {
    this.lines.push(l)
  }
  split(): void {
    if (this.lines.length) this.slides.push(this.lines.join('\n'))
    this.lines = []
  }
  done(): string[] {
    this.split()
    return this.slides
  }
}

const KNOWN_LABEL =
  /^(verse|chorus|bridge|pre[\s-]?chorus|tag|intro|outro|ending|refrain|interlude|coda|misc)\s*(\d+)?\s*:?$/i

/** Normalised section label for a known label like "CHORUS:" or "Verse 2"; null if not a label. */
function knownLabel(text: string): string | null {
  const m = text.trim().match(KNOWN_LABEL)
  if (!m) return null
  const w = m[1].toLowerCase().replace(/\s+/g, '')
  const name = /^pre-?chorus$/.test(w) ? 'Pre-Chorus' : w.charAt(0).toUpperCase() + w.slice(1)
  return m[2] ? `${name} ${Number(m[2])}` : name
}

// ---------------------------------------------------------------- ChordPro

const DIRECTIVE = /^\{\s*([a-z_]+)(?:[:\s]\s*(.*?))?\s*\}$/i
const START: Record<string, string> = {
  start_of_verse: 'Verse', sov: 'Verse',
  start_of_chorus: 'Chorus', soc: 'Chorus',
  start_of_bridge: 'Bridge', sob: 'Bridge'
}
const END = new Set(['end_of_verse', 'eov', 'end_of_chorus', 'eoc', 'end_of_bridge', 'eob'])
const SKIP_START = new Set(['start_of_tab', 'sot', 'start_of_grid', 'sog'])
const SKIP_END = new Set(['end_of_tab', 'eot', 'end_of_grid', 'eog'])
const COMMENTS = new Set(['comment', 'c', 'ci', 'comment_italic', 'cb', 'comment_box'])

export function parseChordPro(text: string, file: string): ImportedSong {
  const meta: Record<string, string> = {}
  const sections: RawSection[] = []
  const order: number[] = []
  let cur: { index: number; slides: SlideBuilder } | null = null
  let pending: string | null = null
  let lastChorus = -1
  let skipping = false
  let droppedBlocks = 0
  let nextIsChorus = false

  const close = (): void => {
    if (cur) sections[cur.index].slides = cur.slides.done()
    cur = null
  }
  const open = (): NonNullable<typeof cur> => {
    if (!cur) {
      sections.push({ name: pending, slides: [] })
      cur = { index: sections.length - 1, slides: new SlideBuilder() }
      order.push(cur.index)
      if (nextIsChorus) lastChorus = cur.index
    }
    return cur
  }
  const begin = (label: string | null, chorus: boolean): void => {
    close()
    pending = label
    nextIsChorus = chorus
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (skipping) {
      const d = line.match(DIRECTIVE)
      if (d && SKIP_END.has(d[1].toLowerCase())) skipping = false
      continue
    }
    if (line.startsWith('#')) continue
    const d = line.match(DIRECTIVE)
    if (d) {
      const name = d[1].toLowerCase()
      const arg = (d[2] ?? '').trim()
      if (name === 'title' || name === 't') meta.title ??= arg
      else if (name === 'artist' || name === 'subtitle' || name === 'st') meta.author ??= arg
      else if (name === 'ccli') meta.ccli ??= arg
      else if (name === 'copyright') meta.copyright ??= arg
      else if (name in START) begin(arg || START[name], START[name] === 'Chorus')
      else if (END.has(name)) {
        close()
        pending = null
      } else if (SKIP_START.has(name)) {
        close()
        pending = null
        skipping = true
        droppedBlocks++
      } else if (name === 'chorus') {
        close()
        pending = null
        if (lastChorus >= 0) order.push(lastChorus)
      } else if (COMMENTS.has(name)) {
        const label = knownLabel(arg)
        if (label) begin(label, false)
      }
      continue
    }
    if (!line) {
      ;(cur as { slides: SlideBuilder } | null)?.slides.split()
      continue
    }
    const lyric = line.replace(/\[[^\]]*\]/g, '').trim()
    if (!lyric) continue // chord-only line
    open().slides.line(lyric)
  }
  close()

  if (!sections.some((s) => s.slides.length)) throw new Error('No lyrics found in this ChordPro song')
  const assembled = assembleSong(sections, order)
  const notes = [...assembled.notes]
  if (droppedBlocks) notes.unshift('Tab or grid blocks left out')
  return {
    title: meta.title || baseName(file),
    author: meta.author ?? '',
    ccli: meta.ccli ?? '',
    copyright: meta.copyright ?? '',
    lyrics: assembled.lyrics,
    arrangement: assembled.arrangement,
    source: 'ChordPro',
    category: null,
    notes,
    file
  }
}

// ---------------------------------------------------------------- SongSelect USR

export function parseSongSelectUsr(text: string, file: string): ImportedSong {
  const v: Record<string, string> = {}
  let ccli = ''
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const s = line.match(/^\[S\s+A?(\d+)\]/i)
    if (s) {
      ccli ||= s[1]
      continue
    }
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('[')) {
      const k = line.slice(0, eq).trim().toLowerCase()
      if (!(k in v)) v[k] = line.slice(eq + 1).trim()
    }
  }
  const names = (v.fields ?? '').split('/t').map((n) => n.trim())
  const words = (v.words ?? '').split('/t')
  const sections: RawSection[] = []
  let withoutWords = 0
  names.forEach((n, i) => {
    const b = new SlideBuilder()
    for (const l of (words[i] ?? '').replace(/\/n/g, '\n').split('\n')) {
      if (l.trim()) b.line(l.trim())
      else b.split()
    }
    const slides = b.done()
    if (!slides.length) withoutWords++
    sections.push({ name: n || null, slides })
  })
  if (!sections.some((s) => s.slides.length)) throw new Error('No lyrics found in this SongSelect song')
  const assembled = assembleSong(sections, [])
  const notes = [...assembled.notes]
  if (withoutWords) notes.push(`${withoutWords} field${withoutWords === 1 ? '' : 's'} without words left out`)
  const people = (s: string | undefined): string =>
    (s ?? '').split('|').map((p) => p.trim()).filter(Boolean).join(', ')
  return {
    title: v.title || baseName(file),
    author: people(v.author),
    ccli,
    copyright: people(v.copyright),
    lyrics: assembled.lyrics,
    arrangement: assembled.arrangement,
    source: 'SongSelect',
    category: null,
    notes,
    file
  }
}

// ---------------------------------------------------------------- plain / SongSelect text

const FOOTER =
  /^(©|\(c\)\s|copyright\b|ccli\s+song\s*#|ccli\s+license\s*#|for use solely with|words(\s+and\s+music)?\s*:|music\s*:)/i

export function parsePlainText(text: string, file: string): ImportedSong {
  const all = text.split('\n').map((l) => l.trim())
  let t = 0
  while (t < all.length && !all[t]) t++
  const hasTitle = t < all.length && !knownLabel(all[t]) && !FOOTER.test(all[t])
  const title = hasTitle ? all[t] : ''
  let lines = all.slice(hasTitle ? t + 1 : t)

  let ccli = ''
  let copyright = ''
  let author = ''
  const footerAt = lines.findIndex((l) => FOOTER.test(l))
  if (footerAt >= 0) {
    const footer = lines.slice(footerAt).filter(Boolean)
    lines = lines.slice(0, footerAt)
    for (const f of footer) {
      const c = f.match(/^ccli\s+song\s*#\s*(\d+)/i)
      if (c) ccli ||= c[1]
      else if (/^(©|\(c\)\s)/i.test(f)) copyright ||= f.replace(/^(©|\(c\))\s*/i, '').trim()
      else if (/^words(\s+and\s+music)?\s*:/i.test(f)) author ||= f.replace(/^[^:]*:\s*/, '').trim()
    }
    // an author line sits by itself just before the © line
    if (footer.some((f) => /^(©|\(c\)\s)/i.test(f))) {
      let i = lines.length - 1
      while (i >= 0 && !lines[i]) i--
      if (i > 0 && !knownLabel(lines[i]) && !lines[i - 1] && lines.slice(0, i).some(Boolean)) {
        author = lines[i]
        lines = lines.slice(0, i)
      }
    }
  }

  const sections: RawSection[] = []
  const order: number[] = []
  const seen = new Map<string, number>()
  let name: string | null = null
  let b = new SlideBuilder()
  let started = false
  const flush = (): void => {
    const slides = b.done()
    b = new SlideBuilder()
    if (!started || !slides.length) return
    const key = `${name ?? ''}\u0000${slides.join('\u0001')}`
    const prior = seen.get(key)
    if (prior !== undefined) {
      order.push(prior)
      return
    }
    sections.push({ name, slides })
    seen.set(key, sections.length - 1)
    order.push(sections.length - 1)
  }
  started = true
  for (const l of lines) {
    const label = knownLabel(l)
    if (label) {
      flush()
      name = label
      started = true
    } else if (!l) b.split()
    else b.line(l)
  }
  flush()

  if (!sections.length) throw new Error('No lyrics found in this text song')
  const assembled = assembleSong(sections, order)
  return {
    title: title || baseName(file),
    author,
    ccli,
    copyright,
    lyrics: assembled.lyrics,
    arrangement: assembled.arrangement,
    source: ccli ? 'SongSelect' : 'Text',
    category: null,
    notes: assembled.notes,
    file
  }
}
