import { useState } from 'react'
import { abbreviate } from '@shared/lyrics'
import { SlideRenderer } from '../components/SlideRenderer'
import { actions, slidesOf, themeFor, useStore } from './store'

export function SlideGrid() {
  const song = useStore((s) => s.songs.find((x) => x.id === s.selectedSongId))
  const themes = useStore((s) => s.themes)
  const theme = useStore((s) => themeFor(song, s))
  const live = useStore((s) => s.live)
  const [size, setSize] = useState(260)

  if (!song) {
    return (
      <div className="placeholder">
        <h2>Select a song</h2>
        <p>Pick a song from the library or the service to see its slides.</p>
        <p className="keys">
          <kbd>→</kbd>/<kbd>Space</kbd> next · <kbd>←</kbd> back · <kbd>B</kbd> black · <kbd>C</kbd> clear text · <kbd>L</kbd>{' '}
          logo · <kbd>Esc</kbd> clear all
        </p>
      </div>
    )
  }

  const slides = slidesOf(song)
  const remove = (): void => {
    if (confirm(`Delete “${song.title}” from the library? This cannot be undone.`)) void actions.deleteSong(song.id)
  }

  return (
    <div className="slide-grid-wrap">
      <div className="grid-head">
        <div>
          <h1>{song.title}</h1>
          <div className="meta">
            {[song.author, song.ccli && `CCLI #${song.ccli}`, song.copyright].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="spacer" />
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
        <input
          type="range"
          min={160}
          max={420}
          value={size}
          onChange={(e) => setSize(+e.target.value)}
          title="Thumbnail size"
        />
        <button onClick={() => actions.editSong(song)}>✎ Edit</button>
        <button className="ghost danger" onClick={remove} title="Delete song">
          🗑
        </button>
      </div>
      <div className="slide-grid scroll" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
        {slides.map((slide, i) => {
          const isLive = live?.songId === song.id && live.index === i
          return (
            <button key={slide.key} className={`thumb ${isLive ? 'live' : ''}`} onClick={() => actions.goLive(song.id, i)}>
              <SlideRenderer text={slide.text} theme={theme} thumbnail />
              <div className="thumb-label">
                <span className="num">{i + 1}</span>
                {slide.label && <span className="tag">{abbreviate(slide.label)}</span>}
                <span className="label-text">{slide.label}</span>
              </div>
            </button>
          )
        })}
        {!slides.length && (
          <div className="empty">
            This song has no lyrics yet. <button onClick={() => actions.editSong(song)}>Add lyrics</button>
          </div>
        )}
      </div>
    </div>
  )
}
