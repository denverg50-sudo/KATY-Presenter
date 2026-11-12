import { useState } from 'react'
import { actions, currentService, defaultServiceName, useStore } from './store'

export function ServicePanel() {
  const services = useStore((s) => s.services)
  const svc = useStore((s) => currentService(s))
  const songs = useStore((s) => s.songs)
  const selectedItem = useStore((s) => s.selectedItemId)
  const liveItem = useStore((s) => s.live?.itemId)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const onDrop = (e: React.DragEvent, at: number): void => {
    e.preventDefault()
    setDropAt(null)
    const songId = e.dataTransfer.getData('application/x-song-id')
    const itemId = e.dataTransfer.getData('application/x-item-id')
    if (songId) void actions.addToService(songId, at)
    else if (itemId) void actions.moveItem(itemId, at)
  }
  const allowDrop = (e: React.DragEvent, at: number): void => {
    e.preventDefault()
    setDropAt(at)
  }

  const rename = (): void => {
    if (!svc) return
    const name = prompt('Service name', svc.name)
    if (name?.trim()) void actions.saveService({ ...svc, name: name.trim() })
  }
  const remove = (): void => {
    if (svc && confirm(`Delete the service “${svc.name}”? Songs stay in the library.`)) void actions.deleteService(svc.id)
  }

  return (
    <section className="panel service">
      <div className="panel-head">
        <h2>Service</h2>
        <button className="small" onClick={() => void actions.newService(defaultServiceName())}>
          + New
        </button>
      </div>
      {services.length > 0 && (
        <div className="row">
          <select value={svc?.id ?? ''} onChange={(e) => actions.selectService(e.target.value)}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="small ghost" onClick={rename} title="Rename">
            ✎
          </button>
          <button className="small ghost" onClick={remove} title="Delete service">
            🗑
          </button>
        </div>
      )}
      <ol
        className={`list scroll service-list ${dropAt !== null ? 'dragging' : ''}`}
        onDragOver={(e) => allowDrop(e, svc?.items.length ?? 0)}
        onDragLeave={() => setDropAt(null)}
        onDrop={(e) => onDrop(e, svc?.items.length ?? 0)}
      >
        {svc?.items.map((item, i) => {
          const song = songs.find((s) => s.id === item.songId)
          return (
            <li
              key={item.id}
              draggable
              className={[
                item.id === selectedItem ? 'selected' : '',
                item.id === liveItem ? 'is-live' : '',
                dropAt === i ? 'drop-before' : ''
              ].join(' ')}
              onDragStart={(e) => e.dataTransfer.setData('application/x-item-id', item.id)}
              onDragOver={(e) => {
                e.stopPropagation()
                allowDrop(e, i)
              }}
              onDrop={(e) => {
                e.stopPropagation()
                onDrop(e, i)
              }}
              onClick={() => song && actions.selectSong(song.id, item.id)}
            >
              <span className="num">{i + 1}</span>
              <span className="title">{song?.title ?? 'Missing song'}</span>
              <button
                className="icon"
                title="Remove from service"
                onClick={(e) => {
                  e.stopPropagation()
                  void actions.removeItem(item.id)
                }}
              >
                ✕
              </button>
            </li>
          )
        })}
        {!svc?.items.length && <li className="empty">Drag songs here from the library, or double-click a song.</li>}
      </ol>
    </section>
  )
}
