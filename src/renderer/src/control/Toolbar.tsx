import { useEffect, useState } from 'react'
import type { UpdateInfo } from '@shared/types'
import { actions, useStore } from './store'

export function Toolbar() {
  const settings = useStore((s) => s.settings)!
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    void window.api.checkUpdate().then((u) => u?.available && setUpdate(u))
  }, [settings.updateRepo])

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark">✦</span> Katy-Presenter
      </div>
      {update && (
        <button className="update-pill" onClick={() => window.api.openExternal(update.url)}>
          Version {update.latest} is available — Download
        </button>
      )}
      <div className="spacer" />
      <label className="switch" title="Show or hide the audience output">
        <input
          type="checkbox"
          checked={settings.outputVisible}
          onChange={(e) => void actions.saveSettings({ outputVisible: e.target.checked })}
        />
        <span>Output {settings.outputVisible ? 'on' : 'off'}</span>
      </label>
      <button onClick={() => actions.openSettings(true)}>⚙ Settings</button>
    </header>
  )
}
