import { useMemo, useRef, useState } from 'react'
import type { Song } from '@shared/types'
import { abbreviate, buildSlides, parseLyrics, rechunk } from '@shared/lyrics'
import { Modal } from './Modal'
import { actions, useStore } from './store'

const TAGS = ['Verse 1', 'Verse 2', 'Verse 3', 'Pre-Chorus', 'Chorus', 'Bridge', 'Tag', 'Ending']

export function SongEditor() {
  const editing = useStore((s) => s.editingSong)
  return editing ? <Editor key={editing.id} initial={editing} /> : null
}

function Editor({ initial }: { initial: Song }) {
  const themes = useStore((s) => s.themes)
  const isNew = !useStore((s) => s.songs.some((x) => x.id === initial.id))
  const [song, setSong] = useState(initial)
  const lyricsRef = useRef<HTMLTextAreaElement>(null)
  const sections = useMemo(() => parseLyrics(song.lyrics), [song.lyrics])
  const slideCount = useMemo(() => buildSlides(song.lyrics, song.arrangement).length, [song.lyrics, song.arrangement])

  const update = (patch: Partial<Song>): void => setSong((s) => ({ ...s, ...patch }))
  const close = (): void => {
    const dirty = JSON.stringify(song) !== JSON.stringify(initial)
    if (!dirty || confirm('Discard your changes to this song?')) useStore.setState({ editingSong: null })
  }

  const insertTag = (tag: string): void => {
    const ta = lyricsRef.current!
    const { selectionStart: a, selectionEnd: b, value } = ta
    const before = value.slice(0, a)
    const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
    const text = `${prefix}[${tag}]\n`
    update({ lyrics: before + text + value.slice(b) })
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = a + text.length
    })
  }

  return (
    <Modal
      title={isNew ? 'New song' : 'Edit song'}
      onClose={close}
      wide
      footer={
        <>
          <span className="sub">{slideCount} slides</span>
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void actions.saveSong(song)}>
            Save song
          </button>
        </>
      }
    >
      <div className="editor-grid">
        <div className="form">
          <label>
            Title
            <input autoFocus value={song.title} onChange={(e) => update({ title: e.target.value })} />
          </label>
          <div className="row">
            <label className="grow">
              Author
              <input value={song.author} onChange={(e) => update({ author: e.target.value })} />
            </label>
            <label>
              CCLI song #
              <input value={song.ccli} onChange={(e) => update({ ccli: e.target.value })} />
            </label>
          </div>
          <label>
            Copyright
            <input value={song.copyright} onChange={(e) => update({ copyright: e.target.value })} />
          </label>
          <div className="lyrics-tools">
            <span className="sub">Insert:</span>
            {TAGS.map((t) => (
              <button key={t} className="chip" onClick={() => insertTag(t)}>
                [{t}]
              </button>
            ))}
            <div className="spacer" />
            <button className="chip" onClick={() => update({ lyrics: rechunk(song.lyrics, 2) })} title="Re-split every section into 2-line slides">
              Split 2 lines
            </button>
            <button className="chip" onClick={() => update({ lyrics: rechunk(song.lyrics, 4) })} title="Re-split every section into 4-line slides">
              Split 4 lines
            </button>
          </div>
          <textarea
            ref={lyricsRef}
            className="lyrics"
            spellCheck={false}
            value={song.lyrics}
            placeholder={'[Verse 1]\nFirst line\nSecond line\n\nA blank line starts a new slide\n\n[Chorus]\n…'}
            onChange={(e) => update({ lyrics: e.target.value })}
          />
        </div>
        <div className="form">
          <label>
            Arrangement <span className="sub">(optional order, e.g. V1 C V2 C B C)</span>
            <input
              value={song.arrangement}
              placeholder={sections.map((s) => abbreviate(s.label) || '—').join(' ')}
              onChange={(e) => update({ arrangement: e.target.value })}
            />
          </label>
          <div className="section-chips">
            {sections.map((s, i) => (
              <button
                key={i}
                className="chip"
                title="Add to arrangement"
                onClick={() => update({ arrangement: `${song.arrangement} ${abbreviate(s.label)}`.trim() })}
              >
                <b>{abbreviate(s.label) || '—'}</b> {s.label || 'Untitled'} · {s.slides.length}
              </button>
            ))}
          </div>
          <label>
            Theme
            <select value={song.themeId} onChange={(e) => update({ themeId: e.target.value })}>
              <option value="">Default theme</option>
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="help">
            <h3>How lyrics become slides</h3>
            <ul>
              <li>
                Put a section name in square brackets on its own line, like <code>[Chorus]</code>.
              </li>
              <li>Leave a blank line wherever you want a new slide.</li>
              <li>Pasted lyrics with no blank lines? Use “Split 2 lines”.</li>
              <li>Arrangement repeats sections without retyping them. Leave it empty to use the written order.</li>
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  )
}
