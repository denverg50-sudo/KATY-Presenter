import { assembleSong, type ImportedSong, type RawSection } from '@shared/songImport'

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Accepts a show object or an `[id, show]` pair; returns the show object or null. */
function unwrap(value: unknown): Obj | null {
  const v = Array.isArray(value) ? value[1] : value
  if (!isObj(v) || !isObj(v.slides) || !isObj(v.layouts)) return null
  return v
}

export function looksLikeFreeShow(value: unknown): boolean {
  if (Array.isArray(value) && typeof value[0] !== 'string') return false
  return unwrap(value) !== null
}

/** String from a string or number; anything else gives ''. */
function str(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (m, n: string) => {
      const c = Number(n)
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m
    })
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function cleanValue(s: string): string {
  return decodeEntities(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''))
}

function groupName(slide: Obj): string | null {
  const g = str(slide.group) || str(slide.globalGroup).replace(/_/g, '-')
  if (!g) return null
  return g.charAt(0).toUpperCase() + g.slice(1)
}

export function parseFreeShow(json: string, file: string): ImportedSong {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('File is not valid JSON')
  }
  const show = unwrap(data)
  if (!show) throw new Error('Not a FreeShow show file')

  const notes = new Set<string>()
  let oddShapes = 0
  const slides = show.slides as Obj
  const layouts = show.layouts as Obj

  /** Text of one slide, or null when the slide is missing or unusable. */
  const slideText = (id: string): string | null => {
    const slide = slides[id]
    if (!isObj(slide)) return null
    const items = slide.items
    if (items !== undefined && !Array.isArray(items)) oddShapes++
    const out: string[] = []
    for (const item of Array.isArray(items) ? items : []) {
      if (!isObj(item)) {
        oddShapes++
        continue
      }
      if (item.type !== undefined && item.type !== 'text') continue
      if (item.lines === undefined) continue
      if (!Array.isArray(item.lines)) {
        oddShapes++
        continue
      }
      const lines: string[] = []
      for (const line of item.lines) {
        if (!isObj(line) || !Array.isArray(line.text)) {
          oddShapes++
          continue
        }
        let text = ''
        for (const part of line.text) {
          if (isObj(part)) text += cleanValue(typeof part.value === 'string' ? part.value : str(part.value))
          else oddShapes++
        }
        lines.push(text)
      }
      const joined = lines.join('\n')
      if (joined.trim()) out.push(joined)
    }
    return out.join('\n')
  }

  const childIds = (slide: Obj): string[] =>
    Array.isArray(slide.children) ? slide.children.filter((c): c is string => typeof c === 'string') : []

  const sections: RawSection[] = []
  const order: number[] = []
  let ungrouped = 0
  let disabledEntries = 0
  let disabledChildren = 0
  let missing = 0
  let missingChild = 0

  /** Build a section for a parent slide; `skip` lists disabled child ids. */
  const hasTextItems = (id: string): boolean => {
    const items = isObj(slides[id]) ? (slides[id] as Obj).items : undefined
    return Array.isArray(items) && items.some((i) => isObj(i) && (i.type === undefined || i.type === 'text'))
  }
  const buildSection = (id: string, skip: Set<string>): RawSection | null => {
    const slide = slides[id]
    if (!isObj(slide)) return null
    const parts: string[] = []
    const own = slideText(id)
    if (own !== null && own.trim()) parts.push(own)
    for (const c of childIds(slide)) {
      if (skip.has(c)) {
        disabledChildren++
        continue
      }
      const t = slideText(c)
      if (t === null) missingChild++
      else parts.push(t)
    }
    return { name: groupName(slide), slides: parts }
  }

  const settings = isObj(show.settings) ? show.settings : {}
  const active = str(settings.activeLayout)
  const activeMissing = !!active && layouts[active] === undefined
  const layoutKey = active && !activeMissing ? active : Object.keys(layouts)[0]
  const layout = layoutKey === undefined ? undefined : layouts[layoutKey]
  const layoutName = (isObj(layout) && str(layout.name)) || layoutKey || ''
  const referenced = new Set<string>()
  const entries = isObj(layout) && Array.isArray(layout.slides) ? layout.slides : []

  const seen = new Map<string, number>()
  for (const entry of entries) {
    if (!isObj(entry)) {
      oddShapes++
      continue
    }
    if (entry.disabled === true) {
      if (typeof entry.id === 'string') referenced.add(entry.id)
      disabledEntries++
      continue
    }
    const id = typeof entry.id === 'string' ? entry.id : ''
    if (id) referenced.add(id)
    if (!id || !isObj(slides[id])) {
      missing++
      continue
    }
    const skip = new Set<string>()
    if (isObj(entry.children)) {
      for (const [cid, v] of Object.entries(entry.children)) if (isObj(v) && v.disabled === true) skip.add(cid)
    }
    const key = `${id}|${[...skip].sort().join(',')}`
    let idx = seen.get(key)
    if (idx === undefined) {
      const sec = buildSection(id, skip)
      if (!sec) {
        missing++
        continue
      }
      if (!sec.slides.length && !hasTextItems(id) && !childIds(slides[id] as Obj).length) continue // media-only slide
      if (sec.name === null) ungrouped++
      idx = sections.push(sec) - 1
      seen.set(key, idx)
    }
    order.push(idx)
  }

  let leftOut = 0
  if (sections.length) {
    const children = new Set<string>()
    for (const sl of Object.values(slides)) if (isObj(sl)) childIds(sl).forEach((c) => children.add(c))
    const slideHasText = (id: string): boolean =>
      !!slideText(id)?.trim() || childIds(slides[id] as Obj).some((c) => !!slideText(c)?.trim())
    for (const id of Object.keys(slides)) {
      if (isObj(slides[id]) && !children.has(id) && !referenced.has(id) && slideHasText(id)) leftOut++
    }
  }
  if (!sections.length) {
    // no usable layout: use the slides in written order, skipping slides that are children
    const children = new Set<string>()
    for (const s of Object.values(slides)) if (isObj(s)) childIds(s).forEach((c) => children.add(c))
    for (const id of Object.keys(slides)) {
      if (children.has(id)) continue
      const sec = buildSection(id, new Set())
      if (!sec) {
        oddShapes++
        continue
      }
      if (sec.name === null) ungrouped++
      sections.push(sec)
    }
    if (sections.length) notes.add('No usable layout; used the slides in written order')
  }

  const meta = isObj(show.meta) ? show.meta : {}
  const title = str(meta.title) || str(show.name) || file.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')
  const hasText = sections.some((s) => s.slides.some((t) => t.trim()))
  if (!hasText) throw new Error('No lyrics found in this FreeShow show')

  const assembled = assembleSong(sections, order)

  if (activeMissing) notes.add(`Active layout not found; used "${layoutName}"`)
  if (leftOut) {
    notes.add(`${leftOut} slide${leftOut === 1 ? '' : 's'} not in the active layout left out`)
    const n = Object.keys(layouts).length
    if (n > 1) notes.add(`Show has ${n} layouts; used "${layoutName}"`)
  }
  if (missing) notes.add('Layout points to a missing slide')
  if (missingChild) notes.add('A slide points to a missing child slide')
  if (disabledEntries) notes.add(`${disabledEntries} disabled layout ${disabledEntries === 1 ? 'entry' : 'entries'} skipped`)
  if (disabledChildren) {
    notes.add(`${disabledChildren} disabled child slide${disabledChildren === 1 ? '' : 's'} left out`)
  }
  if (ungrouped) {
    notes.add(`${ungrouped} ungrouped slide${ungrouped === 1 ? '' : 's'} imported as "Slide N"`)
  }
  if (oddShapes) notes.add('Some slide data was in an unexpected format and was skipped')

  return {
    title,
    author: str(meta.author) || str(meta.artist),
    ccli: str(meta.CCLI) || str(meta.ccli),
    copyright: str(meta.copyright),
    lyrics: assembled.lyrics,
    arrangement: assembled.arrangement,
    source: 'FreeShow',
    category: str(show.category) || null,
    notes: [...notes, ...assembled.notes],
    file
  }
}
