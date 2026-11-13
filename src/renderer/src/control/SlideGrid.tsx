import { useState } from 'react'
import { abbreviate } from '@shared/lyrics'
import { SlideRenderer } from '../components/SlideRenderer'
import { passageKey } from './presentable'
import { actions, samePresentable, slidesFor, themeFor, titleOf, useStore } from './store'
import type { VersesPerSlide } from './presentable'

export function SlideGrid() {
  const selected = useStore((s) => s.selected)
  const song = useStore((s) => {
    const p = s.selected
    return p?.kind === 'song' ? s.songs.find((x) => x.id === p.songId) : undefined
  })
  const slides = useStore((s) => slidesFor(s.selected, s))
  const title = useStore((s) => titleOf(s.selected, s))
  const status = useStore((s) => scriptureStatus(s))
  const themes = useStore((s) => s.themes)
  const theme = useStore((s) => themeFor(s.selected, s))
  const live = useStore((s) => s.live)
  const bibles = useStore((s) => s.bibles)
  const [size, setSize] = useState(260)

  if (!selected || (selected.kind === 'song' && !song)) {
    return (
      <div className="placeholder">
        <h2>Select a song or passage</h2>
        <p>Pick a song, look up a Bible passage, or click an item in the service to see its slides.</p>
        <p className="keys">
          <kbd>→</kbd>/<kbd>Space</kbd> next · <kbd>←</kbd> back · <kbd>B</kbd> black · <kbd>C</kbd> clear text · <kbd>L</kbd>{' '}
          logo · <kbd>Esc</kbd> clear all
        </p>
      </div>
    )
  }

  const remove = (): void => {
    if (song && confirm(`Delete “${song.title}” from the library? This cannot be undone.`)) void actions.deleteSong(song.id)
  }

  return (
    <div className="slide-grid-wrap">
      <div className="grid-head">
        <div>
          <h1>{title}</h1>
          <div className="meta">
            {song ? [song.author, song.ccli && `CCLI #${song.ccli}`, song.copyright].filter(Boolean).join(' · ') : status}
          </div>
        </div>
        <div className="spacer" />
        {song && (
          <>
            <label className="inline">
              Theme
              <select value={song.themeId} onChange={(e) => void actions.setSongTheme(song, e.target.value)}>
                <option value="">Default</option>
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {selected.kind === 'scripture' && (
          <>
            <label className="inline">
              Bible
              <select
                value={bibles.some((b) => b.id === selected.bibleId) ? selected.bibleId : ''}
                onChange={(e) => e.target.value && void actions.updateSelectedScripture({ bibleId: e.target.value })}
              >
                {!bibles.some((b) => b.id === selected.bibleId) && <option value="">Not installed</option>}
                {bibles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.abbrev}
                  </option>
                ))}
              </select>
            </label>
            <div className="segmented" title="Verses per slide">
              {([1, 2, 3] as VersesPerSlide[]).map((n) => (
                <button
                  key={n}
                  className={selected.versesPerSlide === n ? 'active' : ''}
                  onClick={() => void actions.updateSelectedScripture({ versesPerSlide: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            <label className="inline">
              Theme
              <select value={selected.themeId} onChange={(e) => void actions.updateSelectedScripture({ themeId: e.target.value })}>
                <option value="">Scripture default</option>
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <input
          type="range"
          min={160}
          max={420}
          value={size}
          onChange={(e) => setSize(+e.target.value)}
          title="Thumbnail size"
        />
        {song && (
          <>
            <button onClick={() => actions.editSong(song)}>✎ Edit</button>
            <button className="ghost danger" onClick={remove} title="Delete song">
              🗑
            </button>
          </>
        )}
      </div>
      <div className="slide-grid scroll" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
        {slides.map((slide, i) => {
          const isLive = !!live && samePresentable(live.item, selected) && live.index === i
          return (
            <button key={slide.key} className={`thumb ${isLive ? 'live' : ''}`} onClick={() => actions.goLive(selected, i)}>
              <SlideRenderer text={slide.text} footer={'footer' in slide ? slide.footer : null} theme={theme} thumbnail />
              <div className="thumb-label">
                <span className="num">{i + 1}</span>
                {slide.label && !('footer' in slide) && <span className="tag">{abbreviate(slide.label)}</span>}
                <span className="label-text">{slide.label}</span>
              </div>
            </button>
          )
        })}
        {!slides.length && song && (
          <div className="empty">
            This song has no lyrics yet. <button onClick={() => actions.editSong(song)}>Add lyrics</button>
          </div>
        )}
        {!slides.length && selected.kind === 'scripture' && <div className="empty">{status}</div>}
      </div>
    </div>
  )
}

type S = Parameters<Parameters<typeof useStore>[0]>[0]

/** Meta line under a scripture title: loading, lookup error or missing Bible. */
function scriptureStatus(s: S): string {
  const p = s.selected
  if (p?.kind !== 'scripture') return ''
  if (!s.bibles.some((b) => b.id === p.bibleId)) return 'Bible not installed'
  const found = s.passages[passageKey(p.bibleId, p.ref)]
  if (!found) return 'Loading…'
  if ('error' in found) return found.error
  const n = found.verses.length
  return `${n} ${n === 1 ? 'verse' : 'verses'} · ${p.versesPerSlide} per slide`
}
