import { useEffect } from 'react'
import { actions, useStore } from './store'

if (import.meta.env.DEV) {
  // Exposed for the dev smoke test only
  Object.assign(window, { __katy: { actions, useStore } })
}
import { Toolbar } from './Toolbar'
import { ServicePanel } from './ServicePanel'
import { Library } from './Library'
import { SlideGrid } from './SlideGrid'
import { LivePanel } from './LivePanel'
import { ThemesPanel } from './ThemesPanel'
import { SongEditor } from './SongEditor'
import { ThemeEditor } from './ThemeEditor'
import { SettingsDialog } from './SettingsDialog'

export function ControlApp() {
  const loaded = useStore((s) => s.loaded)
  const modalOpen = useStore((s) => !!(s.editingSong || s.editingTheme || s.showSettings))

  useEffect(() => {
    void actions.load()
  }, [])

  // Keyboard control while operating a service
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (modalOpen || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      const k = e.key
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown') void actions.step(1)
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') void actions.step(-1)
      else if (k === 'b' || k === 'B') actions.toggle('black')
      else if (k === 'c' || k === 'C') actions.toggle('clear')
      else if (k === 'l' || k === 'L') actions.toggle('logo')
      else if (k === 'Escape') actions.clearAll()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

  if (!loaded) return <div className="loading">Loading library…</div>

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <aside className="col left">
          <ServicePanel />
          <Library />
        </aside>
        <main className="col center">
          <SlideGrid />
        </main>
        <aside className="col right">
          <LivePanel />
          <ThemesPanel />
        </aside>
      </div>
      <SongEditor />
      <ThemeEditor />
      <SettingsDialog />
    </div>
  )
}
