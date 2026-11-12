import { newTheme } from '@shared/defaults'
import { SlideRenderer } from '../components/SlideRenderer'
import { actions, useStore } from './store'

export function ThemesPanel() {
  const themes = useStore((s) => s.themes)
  const defaultId = useStore((s) => s.settings?.defaultThemeId)

  return (
    <section className="panel grow">
      <div className="panel-head">
        <h2>Themes</h2>
        <button className="small" onClick={() => actions.editTheme(newTheme())}>
          + New theme
        </button>
      </div>
      <div className="theme-list scroll">
        {themes.map((t) => (
          <button key={t.id} className="theme-card" onClick={() => actions.editTheme(t)} title="Edit theme">
            <SlideRenderer text="Aa" theme={{ ...t, fontSize: Math.min(t.fontSize * 3, 400) }} thumbnail />
            <span>
              {t.name}
              {t.id === defaultId && <em> · default</em>}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
