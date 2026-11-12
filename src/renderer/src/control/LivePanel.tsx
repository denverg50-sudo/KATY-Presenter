import { SlideRenderer } from '../components/SlideRenderer'
import { actions, currentService, liveState, slidesOf, themeFor, useStore } from './store'
import { useShallow } from 'zustand/react/shallow'

export function LivePanel() {
  const live = useStore(useShallow((s) => liveState(s)))
  const flags = useStore(useShallow((s) => ({ black: s.black, clear: s.clear, logo: s.logo, hasLive: !!s.live })))
  const next = useStore(useShallow((s) => nextSlide(s)))

  return (
    <section className="panel live-panel">
      <div className="panel-head">
        <h2>
          <span className={`dot ${flags.hasLive ? 'on' : ''}`} /> Live output
        </h2>
      </div>
      <SlideRenderer
        className="preview"
        text={live.text}
        theme={live.theme}
        black={live.black}
        logo={live.logo}
        logoMedia={live.logoMedia}
        transitionMs={150}
      />
      <div className="live-buttons">
        <button className={flags.black ? 'active' : ''} onClick={() => actions.toggle('black')}>
          Black <kbd>B</kbd>
        </button>
        <button className={flags.clear ? 'active' : ''} onClick={() => actions.toggle('clear')}>
          Clear text <kbd>C</kbd>
        </button>
        <button className={flags.logo ? 'active' : ''} onClick={() => actions.toggle('logo')}>
          Logo <kbd>L</kbd>
        </button>
        <button onClick={() => actions.clearAll()}>
          Clear all <kbd>Esc</kbd>
        </button>
      </div>
      <div className="nav-buttons">
        <button onClick={() => actions.step(-1)}>◀ Previous</button>
        <button className="primary" onClick={() => actions.step(1)}>
          Next ▶
        </button>
      </div>
      <div className="next-label">Next {next.label && <span className="sub">— {next.label}</span>}</div>
      <SlideRenderer className="preview small" text={next.text} theme={next.theme} thumbnail />
    </section>
  )
}

type S = Parameters<Parameters<typeof useStore>[0]>[0]

/** What pressing "Next" will show, including the first slide of the next song in the service. */
function nextSlide(s: S): { text: string | null; theme: ReturnType<typeof themeFor>; label: string } {
  const none = { text: null, theme: null, label: '' }
  if (!s.live) {
    const song = s.songs.find((x) => x.id === s.selectedSongId)
    const first = slidesOf(song)[0]
    return first ? { text: first.text, theme: themeFor(song, s), label: song!.title } : none
  }
  const song = s.songs.find((x) => x.id === s.live!.songId)
  const slides = slidesOf(song)
  if (s.live.index + 1 < slides.length) {
    return { text: slides[s.live.index + 1].text, theme: themeFor(song, s), label: slides[s.live.index + 1].label }
  }
  const svc = currentService(s)
  const pos = svc?.items.findIndex((i) => i.id === s.live!.itemId) ?? -1
  const item = pos >= 0 ? svc!.items[pos + 1] : undefined
  const nextSong = item && s.songs.find((x) => x.id === item.songId)
  const first = slidesOf(nextSong)[0]
  return first ? { text: first.text, theme: themeFor(nextSong, s), label: nextSong!.title } : { ...none, label: 'End' }
}
