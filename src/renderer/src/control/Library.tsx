import { useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import type { Song } from '@shared/types'
import { actions, useStore } from './store'
import { BiblePanel } from './BiblePanel'

type Tab = 'songs' | 'bible'

/** Left-column library: songs and Bibles in two tabs. Both stay mounted so each keeps what was typed. */
export function Library() {
  const [tab, setTab] = useState<Tab>('songs')
  return (
    <section className="panel grow library">
      <div className="panel-head">
        <div className="segmented tabs" role="tablist">
          {(['songs', 'bible'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'songs' ? 'Songs' : 'Bible'}
            </button>
          ))}
        </div>
        {tab === 'songs' && (
          <button className="primary small" onClick={() => actions.newSong()}>
            + New song
          </button>
        )}
      </div>
      <div className="tab-body" style={tab === 'songs' ? undefined : { display: 'none' }}>
        <SongsTab />
      </div>
      <div className="tab-body" style={tab === 'bible' ? undefined : { display: 'none' }}>
        <BiblePanel />
      </div>
    </section>
  )
}

function SongsTab() {
  const songs = useStore((s) => s.songs)
  const selected = useStore((s) => (s.selected?.kind === 'song' ? s.selected.songId : null))
  const [query, setQuery] = useState('')

  const index = useMemo(() => {
    const ms = new MiniSearch<Song>({
      fields: ['title', 'author', 'lyrics', 'ccli'],
      storeFields: ['id'],
      searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2 }
    })
    ms.addAll(songs)
    return ms
  }, [songs])

  const shown = useMemo(() => {
    if (!query.trim()) return songs
    const ids = index.search(query).map((r) => r.id as string)
    return ids.map((id) => songs.find((s) => s.id === id)!).filter(Boolean)
  }, [query, index, songs])

  return (
    <>
      <input
        className="search"
        type="search"
        placeholder={`Search ${songs.length} songs — title, lyrics, author…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="list scroll">
        {shown.map((song) => (
          <li
            key={song.id}
            className={song.id === selected ? 'selected' : ''}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-song-id', song.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => actions.selectSong(song.id)}
            onDoubleClick={() => void actions.addToService(song.id)}
            title="Click to view · Double-click or drag to add to the service"
          >
            <span className="title">{song.title}</span>
            {song.author && <span className="sub">{song.author}</span>}
          </li>
        ))}
        {!shown.length && <li className="empty">{query ? 'No songs match.' : 'No songs yet.'}</li>}
      </ul>
    </>
  )
}
