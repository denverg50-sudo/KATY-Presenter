import { SaxesParser } from 'saxes'
import { assembleSong, sectionNameFromCode, type ImportedSong, type RawSection } from '@shared/songImport'

const FIELDS = ['title', 'author', 'copyright', 'ccli', 'presentation', 'lyrics']
const NUMBERED = /^ ?(\d{1,2})(?![\d,.])\s*(.*)$/

interface Block {
  code: string | null
  lines: string[]
}

export function parseOpenSong(xml: string, file: string): ImportedSong {
  const parser = new SaxesParser({ xmlns: false, fragment: false })
  const values: Record<string, string> = {}
  let depth = 0
  let field: string | null = null
  let sawSong = false
  parser.on('opentag', (tag) => {
    depth++
    if (depth === 1 && tag.name.toLowerCase() === 'song') sawSong = true
    const n = tag.name.toLowerCase()
    if (depth === 2 && sawSong && FIELDS.includes(n) && !(n in values)) {
      field = n
      values[n] = ''
    }
  })
  const add = (t: string): void => {
    if (field) values[field] += t
  }
  parser.on('text', add)
  parser.on('cdata', add)
  parser.on('closetag', () => {
    if (depth === 2) field = null
    depth--
  })
  try {
    parser.write(xml).close()
  } catch {
    throw new Error('File is not valid XML')
  }
  if (!sawSong) throw new Error('Not an OpenSong song')

  // Split the lyrics text into blocks by [CODE] headers.
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const raw of (values.lyrics ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (raw.startsWith('.') || raw.startsWith(';')) continue
    const t = raw.trim()
    const h = t.match(/^\[(.+)\]$/)
    if (h) {
      cur = { code: h[1].trim(), lines: [] }
      blocks.push(cur)
      continue
    }
    if (!cur) {
      if (!t) continue
      cur = { code: null, lines: [] }
      blocks.push(cur)
    }
    cur.lines.push(t)
  }

  // Turn each block into one or more sections.
  const sections: RawSection[] = []
  const byCode = new Map<string, number>()
  const addSection = (code: string | null, lines: string[]): void => {
    const slides: string[] = []
    let slide: string[] = []
    const flush = (): void => {
      slides.push(slide.join('\n'))
      slide = []
    }
    for (const l of lines) {
      if (!l) {
        flush()
        continue
      }
      const parts = l.replace(/_/g, '').split(/\|+/)
      parts.forEach((p, i) => {
        if (p.trim()) slide.push(p.trim())
        if (i < parts.length - 1) flush()
      })
    }
    flush()
    if (code && !byCode.has(code.toLowerCase())) byCode.set(code.toLowerCase(), sections.length)
    sections.push({ name: code ? sectionNameFromCode(code) : null, slides })
  }

  for (const b of blocks) {
    const first = b.lines.find(Boolean)
    const numbered = b.code && /^[a-z]$/i.test(b.code) && first !== undefined && NUMBERED.test(first)
    if (!numbered) {
      addSection(b.code, b.lines)
      continue
    }
    let num = ''
    let group: string[] = []
    const done = (): void => {
      if (num) addSection(b.code + num, group)
    }
    for (const l of b.lines) {
      const m = l.match(NUMBERED)
      if (m && l.length > 0 && /^\d/.test(l.trimStart())) {
        done()
        num = String(Number(m[1]))
        group = [m[2].trim()]
      } else if (num) group.push(l)
    }
    done()
  }

  if (!sections.some((s) => s.slides.some((t) => t.trim()))) throw new Error('No lyrics found in this OpenSong song')

  const order: number[] = []
  const unknown: string[] = []
  for (const c of (values.presentation ?? '').split(/\s+/).filter(Boolean)) {
    const i = byCode.get(c.toLowerCase())
    if (i === undefined) unknown.push(c)
    else order.push(i)
  }

  const assembled = assembleSong(sections, order)
  const notes: string[] = []
  if (unknown.length) notes.push(`Play order mentions unknown section${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`)
  const v = (k: string): string => (values[k] ?? '').trim()

  return {
    title: v('title') || file.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, ''),
    author: v('author'),
    ccli: v('ccli'),
    copyright: v('copyright'),
    lyrics: assembled.lyrics,
    arrangement: assembled.arrangement,
    source: 'OpenSong',
    category: null,
    notes: [...notes, ...assembled.notes],
    file
  }
}
