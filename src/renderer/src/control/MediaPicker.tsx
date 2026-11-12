import { isVideo, mediaUrl } from '@shared/types'
import { actions, useStore } from './store'

/** Grid of files in the media library, with an "Add files…" button. */
export function MediaPicker(props: { value: string; onChange: (name: string) => void; kind?: 'image' | 'video' | 'any' }) {
  const media = useStore((s) => s.media)
  const kind = props.kind ?? 'any'
  const shown = media.filter((m) => kind === 'any' || (kind === 'video') === isVideo(m))

  const add = async (): Promise<void> => {
    const added = await actions.importMedia()
    const match = added.find((m) => kind === 'any' || (kind === 'video') === isVideo(m))
    if (match) props.onChange(match)
  }

  return (
    <div className="media-picker">
      <button className="media-tile add" onClick={() => void add()}>
        + Add files…
      </button>
      {shown.map((m) => (
        <button
          key={m}
          className={`media-tile ${m === props.value ? 'selected' : ''}`}
          onClick={() => props.onChange(m)}
          title={m}
        >
          {isVideo(m) ? <video src={`${mediaUrl(m)}#t=1`} muted preload="metadata" /> : <img src={mediaUrl(m)} alt="" />}
          {isVideo(m) && <span className="badge">▶</span>}
        </button>
      ))}
    </div>
  )
}
