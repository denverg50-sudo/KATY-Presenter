import { SaxesParser } from 'saxes'
import { assembleSong, sectionNameFromCode, type ImportedSong, type RawSection } from '@shared/songImport'

const BR = '\u0001'

const local = (name: string): string => name.replace(/^.*:/, '').toLowerCase()

export function parseOpenLyrics(xml: string, file: string): ImportedSong {
  const parser = new SaxesParser({ xmlns: false, fragment: false })
  const path: string[] = []
  let title = ''
  const authors: string[] = []
  let ccli = ''
  let copyright = ''
  let verseOrder = ''
  let sawSong = false

  const sections: RawSection[] = []
  const byName = new Map<string, number>()
  let skippedVerses = 0
  let verse: { name: string; slides: string[] } | null = null // null when skipped or outside a verse
  let inVerse = false
  let lines: string[] | null = null
  let commentDepth = 0
  let field: string | null = null
  let fieldText = ''

  parser.on('opentag', (tag) => {
    const name = local(tag.name)
    const a = tag.attributes as Record<string, string>
    if (!path.length && name === 'song') sawSong = true
    path.push(name)
    if (name === 'verse') {
      inVerse = true
      const vname = (a.name ?? '').trim()
      if (!vname || byName.has(vname.toLowerCase())) {
        skippedVerses++
        verse = null
      } else {
        verse = { name: vname, slides: [] }
      }
    } else if (inVerse && name === 'lines' && verse) {
      lines = []
    } else if (lines && name === 'br') {
      lines.push(BR)
    } else if (lines && name === 'comment') {
      commentDepth++
    } else if (!inVerse && ['title', 'author', 'cclino', 'copyright', 'verseorder'].includes(name)) {
      field = name
      fieldText = ''
    }
  })

  parser.on('text', (t) => {
    if (lines && !commentDepth) lines.push(t)
    else if (field) fieldText += t
  })
  parser.on('cdata', (t) => {
    if (lines && !commentDepth) lines.push(t)
    else if (field) fieldText += t
  })

  parser.on('closetag', (tag) => {
    const name = local(tag.name)
    path.pop()
    if (name === 'comment' && commentDepth) commentDepth--
    else if (name === 'lines' && lines && verse) {
      const text = lines
        .join('')
        .replace(/[ \t\r\n]+/g, ' ')
        .split(BR)
        .map((l) => l.trim())
        .join('\n')
        .trim()
      verse.slides.push(text)
      lines = null
    } else if (name === 'verse') {
      if (verse) {
        byName.set(verse.name.toLowerCase(), sections.length)
        sections.push({ name: sectionNameFromCode(verse.name), slides: verse.slides })
      }
      verse = null
      inVerse = false
    } else if (field === name) {
      const v = fieldText.replace(/\s+/g, ' ').trim()
      if (name === 'title') title ||= v
      else if (name === 'author') {
        if (v) authors.push(v)
      } else if (name === 'cclino') ccli ||= v
      else if (name === 'copyright') copyright ||= v
      else if (name === 'verseorder') verseOrder ||= v
      field = null
    }
  })

  try {
    parser.write(xml).close()
  } catch {
    throw new Error('File is not valid XML')
  }
  if (!sawSong) throw new Error('Not an OpenLyrics song')
  if (!sections.some((s) => s.slides.some((t) => t.trim()))) throw new Error('No lyrics found in this OpenLyrics song')

  const order: number[] = []
  const unknown: string[] = []
  for (const n of verseOrder.split(/\s+/).filter(Boolean)) {
    const i = byName.get(n.toLowerCase())
    if (i === undefined) unknown.push(n)
    else order.push(i)
  }

  const assembled = assembleSong(sections, order)
  const notes: string[] = []
  if (unknown.length) notes.push(`Play order mentions unknown verse${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`)
  if (skippedVerses) notes.push(`${skippedVerses} repeated verse${skippedVerses === 1 ? '' : 's'} (other languages) skipped`)

  return {
    title: title || file.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, ''),
    author: authors.join(', '),
    ccli,
    copyright,
    lyrics: assembled.lyrics,
    arrangement: assembled.arrangement,
    source: 'OpenLyrics',
    category: null,
    notes: [...notes, ...assembled.notes],
    file
  }
}
