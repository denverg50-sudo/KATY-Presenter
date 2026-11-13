import { useEffect, useRef, useState } from 'react'
import type { PassageVerse } from '@shared/types'
import { bookName } from '@shared/books'
import { asVersesPerSlide, passageKey, type Presentable } from './presentable'
import { highlight, readReference, snippet, usableReference, type ReferenceReading } from './referenceInput'
import { actions, samePresentable, useStore } from './store'

const PARSE_DELAY = 80
const SEARCH_DELAY = 250
const SEARCH_CAP = 200

export function BiblePanel() {
  const bibles = useStore((s) => s.bibles)
  const settings = useStore((s) => s.settings)
  const selected = useStore((s) => s.selected)
  const [chosen, setChosen] = useState(settings?.defaultBibleId ?? '')
  const bibleId = bibles.some((b) => b.id === chosen)
    ? chosen
    : bibles.some((b) => b.id === settings?.defaultBibleId)
      ? settings!.defaultBibleId
      : (bibles[0]?.id ?? '')
  const vps = asVersesPerSlide(settings?.defaultVersesPerSlide)

  // ---------- reference box ----------
  const [text, setText] = useState('')
  const [reading, setReading] = useState<ReferenceReading>({ state: 'empty' })
  useEffect(() => {
    const t = setTimeout(() => setReading(readReference(text)), PARSE_DELAY)
    return () => clearTimeout(t)
  }, [text])
  const ref = usableReference(reading)
  const lookup = useStore((s) => (ref && bibleId ? s.passages[passageKey(bibleId, ref)] : undefined))
  useEffect(() => {
    if (ref && bibleId) void actions.ensurePassage(bibleId, ref)
  }, [ref, bibleId])

  const presentable = (r: string | null): Presentable | null =>
    r && bibleId ? { kind: 'scripture', bibleId, ref: r, themeId: '', versesPerSlide: vps } : null
  // Buttons and Enter read the box as it is right now, not the debounced reading
  const now = (): Presentable | null => presentable(usableReference(readReference(text)))

  const show = (): void => {
    const p = now()
    if (p && !samePresentable(p, selected)) actions.select(p)
  }
  const addToService = (): void => {
    const p = now()
    if (p) void actions.addToService(p)
  }
  const goLive = (): void => {
    const p = now()
    if (!p) return
    actions.select(p)
    actions.goLive(p, 0, null)
  }
  const failed = !!lookup && 'error' in lookup
  const ready = !!ref && !!bibleId && !failed

  // ---------- word search ----------
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ q: string; bibleId: string; verses: PassageVerse[] } | null>(null)
  const latest = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const runSearch = (q: string): void => {
    clearTimeout(timer.current)
    const id = ++latest.current
    void window.api.bibleSearch(bibleId, q).then((verses) => {
      if (id === latest.current) setResults({ q, bibleId, verses })
    })
  }
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !bibleId) {
      latest.current++ // an in-flight search must not bring results back
      setResults(null)
      return
    }
    timer.current = setTimeout(() => runSearch(q), SEARCH_DELAY)
    return () => clearTimeout(timer.current)
  }, [query, bibleId])

  const verseRef = (v: PassageVerse): string => `${bookName(v.book)} ${v.c}:${v.v}`

  if (!bibles.length) {
    return (
      <div className="bible-panel">
        <p className="hint">No Bibles installed. Add one in Settings → Bibles.</p>
      </div>
    )
  }

  return (
    <div className="bible-panel">
      <div className="ref-row">
        <select value={bibleId} onChange={(e) => setChosen(e.target.value)} title={bibles.find((b) => b.id === bibleId)?.name}>
          {bibles.map((b) => (
            <option key={b.id} value={b.id}>
              {b.abbrev}
            </option>
          ))}
        </select>
        <input
          className="ref-input"
          type="text"
          placeholder="Reference, e.g. jn 3:16-18"
          value={text}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              show()
            }
          }}
        />
      </div>
      <div className={`ref-status ${failed || reading.state === 'error' ? 'error' : ''}`}>
        <RefStatus reading={reading} lookup={lookup} />
      </div>
      <div className="ref-actions">
        <button className="small" disabled={!ready} onClick={addToService}>
          Add to service
        </button>
        <button className="small primary" disabled={!ready} onClick={goLive}>
          Go live
        </button>
      </div>

      <div className="divider">or search words</div>
      <input
        className="search"
        type="search"
        placeholder="e.g. love one another"
        value={query}
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          const q = query.trim()
          if (e.key === 'Enter' && q.length >= 2 && bibleId) {
            e.preventDefault()
            runSearch(q)
          }
        }}
      />
      {results && (
        <div className="hint">
          {results.verses.length >= SEARCH_CAP
            ? `First ${SEARCH_CAP} verses`
            : `${results.verses.length} ${results.verses.length === 1 ? 'verse' : 'verses'}`}
        </div>
      )}
      <ul className="list scroll search-results">
        {results?.verses.map((v) => {
          const r = verseRef(v)
          const cut = snippet(v.text, results.q)
          const isSel = selected?.kind === 'scripture' && selected.ref === r && selected.bibleId === results.bibleId
          return (
            <li
              key={`${v.book}.${v.c}.${v.v}`}
              className={isSel ? 'selected' : ''}
              title={v.text}
              onClick={() =>
                actions.select({ kind: 'scripture', bibleId: results.bibleId, ref: r, themeId: '', versesPerSlide: vps })
              }
            >
              <span className="vref">{r}</span>
              <span className="snip">
                {cut.start && '…'}
                {highlight(cut.text, results.q).map((p, i) => (p.hit ? <mark key={i}>{p.s}</mark> : p.s))}
                {cut.end && '…'}
              </span>
            </li>
          )
        })}
        {results && !results.verses.length && <li className="empty">No verses match.</li>}
      </ul>
    </div>
  )
}

function RefStatus({
  reading,
  lookup
}: {
  reading: ReferenceReading
  lookup: ReturnType<typeof useStore.getState>['passages'][string] | undefined
}) {
  const verses = (n: number | null): string => (n === null ? '' : ` · ${n} ${n === 1 ? 'verse' : 'verses'}`)
  const found = lookup && !('error' in lookup) ? lookup.verses.length : null
  switch (reading.state) {
    case 'empty':
      return null
    case 'error':
      return <>{reading.error}</>
    case 'partial':
      if (lookup && 'error' in lookup) return <>{lookup.error}</>
      return reading.last ? (
        <span className="muted">
          {reading.last}
          {verses(found ?? reading.lastCount)} · {reading.hint}
        </span>
      ) : (
        <span className="muted">{reading.hint}</span>
      )
    case 'ok':
      if (lookup && 'error' in lookup) return <>{lookup.error}</>
      return (
        <>
          {reading.formatted}
          {verses(found ?? reading.count)}
        </>
      )
  }
}
