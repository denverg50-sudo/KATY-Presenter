import { useMemo, useState } from 'react'
import MiniSearch from 'minisearch'
import type { Song } from '@shared/types'
import { actions, useStore } from './store'

export function Library() {
  const songs = useStore((s) => s.songs)
  const selected = useStore((s) => s.selectedSongId)
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
    <section className="panel grow">
      <div className="panel-head">
        <h2>Song library</h2>
        <button className="primary small" onClick={() => actions.newSong()}>
          + New song
        </button>
      </div>
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
    </section>
  )
}
