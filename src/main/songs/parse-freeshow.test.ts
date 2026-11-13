import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSlides } from '@shared/lyrics'
import { looksLikeFreeShow, parseFreeShow, readFreeShowSections } from './parse-freeshow'

const dir = join(__dirname, 'fixtures', 'freeshow')
const load = (n: string): string => readFileSync(join(dir, n), 'utf8')
const parse = (n: string) => parseFreeShow(load(n), n)

const GRACE = [
  'Amazing grace how sweet the sound\nThat saved a wretch like me',
  'Oh sing it out for all to hear',
  'Grace is here for you and me',
  'Twas grace that taught my heart to fear\nAnd grace my fears relieved'
]

describe('parseFreeShow', () => {
  it('maps repeat-chorus with numbered verses and arrangement', () => {
    const s = parse('repeat-chorus.show')
    expect(s.title).toBe('Amazing Grace')
    expect(s.author).toBe('John Newton')
    expect(s.ccli).toBe('22025')
    expect(s.copyright).toBe('Public Domain')
    expect(s.source).toBe('FreeShow')
    expect(s.category).toBe('songs')
    expect(s.arrangement).toBe('V1 C V2 C')
    expect(s.lyrics).toBe(
      '[Verse 1]\nAmazing grace how sweet the sound\nThat saved a wretch like me\n\n' +
        '[Chorus]\nOh sing it out for all to hear\n\nGrace is here for you and me\n\n' +
        '[Verse 2]\nTwas grace that taught my heart to fear\nAnd grace my fears relieved'
    )
    expect(s.notes).toEqual([])
    expect(s.file).toBe('repeat-chorus.show')
  })

  it('round-trips to the source slide order', () => {
    const s = parse('repeat-chorus.show')
    expect(buildSlides(s.lyrics, s.arrangement).map((x) => x.text)).toEqual([
      GRACE[0], GRACE[1], GRACE[2], GRACE[3], GRACE[1], GRACE[2]
    ])
  })

  it('accepts the [id, show] pair', () => {
    expect(parse('pair.show')).toEqual({ ...parse('repeat-chorus.show'), file: 'pair.show' })
  })

  it('keeps all text items in order', () => {
    expect(parse('multi-item.show').lyrics).toBe('[Verse]\nLeft box line\nRight box line')
  })

  it('labels ungrouped layout slides and notes it', () => {
    const s = parse('ungrouped.show')
    expect(s.lyrics).toBe('[Slide 1]\nFirst loose slide\n\n[Chorus]\nA chorus here\n\n[Slide 2]\nSecond loose slide')
    expect(s.notes.join(' ')).toMatch(/ungrouped/i)
  })

  it('drops a missing slide with a note', () => {
    const s = parse('missing-slide.show')
    expect(s.lyrics).toBe('[Verse]\nOnly verse')
    expect(s.notes).toContain('Layout points to a missing slide')
  })

  it('throws for a show with no text', () => {
    expect(() => parse('empty.show')).toThrow('No lyrics found in this FreeShow show')
  })

  it('keeps the category and lower-case meta', () => {
    expect(parse('announcement.show').category).toBe('info')
    const m = parse('meta-lower.show')
    expect(m.ccli).toBe('12345')
    expect(m.author).toBe('Some Artist')
    expect(m.category).toBeNull()
  })

  it('throws short errors for bad input', () => {
    expect(() => parseFreeShow('not json', 'x')).toThrow(/not valid JSON/)
    expect(() => parseFreeShow('{"hello":1}', 'x')).toThrow(/not a FreeShow/i)
    expect(() => parseFreeShow('null', 'x')).toThrow(/not a FreeShow/i)
  })
})

function mk(slides: unknown, layoutSlides: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'T',
    slides,
    layouts: { l: { slides: layoutSlides } },
    ...extra
  })
}
const txt = (...v: unknown[]) => [{ lines: [{ text: v.map((value) => ({ value })) }] }]

describe('parseFreeShow tolerance', () => {
  it('handles br, tags and entities', () => {
    const s = parseFreeShow(
      mk({ a: { group: 'Verse', items: txt('Tom &amp; Jerry<br>sing &lt;loud&gt;<br/>&quot;hi&quot;&#39;s&nbsp;<b>bold</b>') } }, [{ id: 'a' }]),
      'f'
    )
    expect(s.lyrics).toBe("[Verse]\nTom & Jerry\nsing <loud>\n\"hi\"'s bold")
  })

  it('skips non-text items', () => {
    const s = parseFreeShow(
      mk({ a: { group: 'Verse', items: [{ type: 'media', lines: [{ text: [{ value: 'NO' }] }] }, ...txt('yes')] } }, [{ id: 'a' }]),
      'f'
    )
    expect(s.lyrics).toBe('[Verse]\nyes')
  })

  it('uses globalGroup when group is empty', () => {
    const s = parseFreeShow(mk({ a: { group: '', globalGroup: 'chorus', items: txt('x') } }, [{ id: 'a' }]), 'f')
    expect(s.lyrics).toBe('[Chorus]\nx')
    expect(s.title).toBe('T')
  })

  it('takes the title from name, then meta.title, then the file name', () => {
    const slides = { a: { group: 'Verse', items: txt('x') } }
    expect(parseFreeShow(mk(slides, [{ id: 'a' }], { meta: { title: 'Meta' } }), 'f').title).toBe('T')
    expect(parseFreeShow(mk(slides, [{ id: 'a' }], { name: '', meta: { title: 'Meta' } }), 'f').title).toBe('Meta')
    expect(parseFreeShow(mk(slides, [{ id: 'a' }], { name: '  ' }), 'dir/My Song.show').title).toBe('My Song')
  })

  it('strips only known formatting tags and keeps other angle-bracket text', () => {
    const s = parseFreeShow(
      mk(
        {
          a: {
            group: 'Verse',
            items: txt(
              '<span style="color: red">Praise</span> the <Lord><br><b>bold</b> <I>it</I> <u>u</u> <em>e</em> <strong>s</strong>',
              '<font face="x">f</font><p>p</p><div class="d">d</div>x<sup>2</sup>y<sub>3</sub><span/> <a>keep</a>'
            )
          }
        },
        [{ id: 'a' }]
      ),
      'f'
    )
    expect(s.lyrics).toBe('[Verse]\nPraise the <Lord>\nbold it u e sfpdx2y3 <a>keep</a>')
  })

  it('skips disabled layout entries and disabled children, with notes', () => {
    const s = parseFreeShow(
      mk(
        {
          a: { group: 'Verse', children: ['b', 'c'], items: txt('one') },
          b: { group: null, items: txt('two') },
          c: { group: null, items: txt('three') },
          d: { group: 'Chorus', items: txt('four') }
        },
        [{ id: 'a', children: { b: { disabled: true } } }, { id: 'd', disabled: true }]
      ),
      'f'
    )
    expect(s.lyrics).toBe('[Verse]\none\n\nthree')
    expect(s.notes.join(' ')).toMatch(/disabled/i)
  })

  it('falls back to written order without a usable layout', () => {
    const s = parseFreeShow(
      mk({ a: { group: 'Verse', children: ['b'], items: txt('one') }, b: { group: null, items: txt('two') }, c: { group: 'Chorus', items: txt('three') } }, []),
      'f'
    )
    expect(s.lyrics).toBe('[Verse]\none\n\ntwo\n\n[Chorus]\nthree')
  })

  it('never throws a TypeError on odd shapes', () => {
    const s = parseFreeShow(
      mk(
        { a: { group: 'Verse', items: [null, { lines: 'x' }, { lines: [null, { text: 'nope' }, { text: [null, { value: 5 }] }] }, ...txt('ok')] }, b: null },
        [null, { id: 'b' }, { id: 7 }, { id: 'a' }]
      ),
      'f'
    )
    expect(s.lyrics).toBe('[Verse]\n5\nok')
    expect(s.notes).toEqual([
      'Layout points to a missing slide',
      'Some slide data was in an unexpected format and was skipped'
    ])
  })

  it('has no notes when the parent slide is empty but children have text', () => {
    const s = parseFreeShow(
      mk({ a: { group: 'Verse', children: ['b'], items: [] }, b: { group: null, items: txt('child') } }, [{ id: 'a' }]),
      'f'
    )
    expect(s.lyrics).toBe('[Verse]\nchild')
    expect(s.notes).toEqual([])
  })

  it('quietly skips media-only slides', () => {
    const s = parseFreeShow(
      mk({ a: { group: 'Verse', items: txt('x') }, m: { group: 'Intro', items: [{ type: 'media' }] } }, [{ id: 'm' }, { id: 'a' }]),
      'f'
    )
    expect(s.lyrics).toBe('[Verse]\nx')
    expect(s.notes).toEqual([])
  })

  it('notes a missing child slide', () => {
    const s = parseFreeShow(mk({ a: { group: 'Verse', children: ['zz'], items: txt('x') } }, [{ id: 'a' }]), 'f')
    expect(s.notes).toEqual(['A slide points to a missing child slide'])
  })

  it('notes slides outside the used layout', () => {
    const s = parse('other-layout.show')
    expect(s.lyrics).toBe('[Verse]\nVerse words\n\n[Chorus]\nChorus words')
    expect(s.notes).toEqual([
      'Active layout not found; used "Short"',
      '1 slide not in the active layout left out',
      'Show has 2 layouts; used "Short"'
    ])
  })
})

describe('FreeShow fixtures round-trip', () => {
  const THROWS = new Set(['empty.show'])
  const clean = (t: string): string =>
    t
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
  const files = readdirSync(dir).filter((f) => f.endsWith('.show') && !THROWS.has(f))
  it('covers the fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(8)
  })
  for (const f of files) {
    it(`${f}: buildSlides gives the parsed play-order slides`, () => {
      const s = parse(f)
      const { sections, order } = readFreeShowSections(load(f), f)
      const slidesOf = (i: number): string[] => sections[i].slides.map(clean).filter(Boolean)
      const valid = (i: number): boolean => slidesOf(i).length > 0
      let play = order.filter(valid)
      if (!play.length) play = sections.map((_, i) => i).filter(valid)
      const expected = play.flatMap(slidesOf)
      const got = buildSlides(s.lyrics, s.arrangement).map((x) => x.text)
      expect(got.length).toBeGreaterThan(0)
      expect(got).toEqual(expected)
    })
  }
})

describe('looksLikeFreeShow', () => {
  it('recognises both forms', () => {
    const show = JSON.parse(load('repeat-chorus.show'))
    expect(looksLikeFreeShow(show)).toBe(true)
    expect(looksLikeFreeShow(['id', show])).toBe(true)
    expect(looksLikeFreeShow({})).toBe(false)
    expect(looksLikeFreeShow(null)).toBe(false)
    expect(looksLikeFreeShow(['id', {}])).toBe(false)
  })
})
