import { useEffect, useState } from 'react'
import type { DisplayInfo } from '@shared/types'
import { Modal } from './Modal'
import { MediaPicker } from './MediaPicker'
import { BibleSettings } from './BibleSettings'
import { actions, useStore } from './store'

export function SettingsDialog() {
  const show = useStore((s) => s.showSettings)
  return show ? <Settings /> : null
}

function Settings() {
  const settings = useStore((s) => s.settings)!
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [note, setNote] = useState('')

  useEffect(() => {
    const load = (): void => void window.api.listDisplays().then(setDisplays)
    load()
    return window.api.onDisplaysChanged(load)
  }, [])

  const backup = async (): Promise<void> => {
    const file = await window.api.exportBackup()
    if (file) setNote(`Backup saved to ${file}`)
  }
  const restore = async (): Promise<void> => {
    if (!confirm('Restore a backup? Songs and themes with the same name/id will be replaced.')) return
    if (await window.api.importBackup()) {
      await actions.load()
      setNote('Backup restored.')
    }
  }
  const checkUpdates = async (): Promise<void> => {
    const u = await window.api.checkUpdate()
    if (!u) setNote('Could not check for updates (set the GitHub repo below, and check your internet).')
    else if (u.available) {
      setNote(`Version ${u.latest} is available.`)
      window.api.openExternal(u.url)
    } else setNote(`You're up to date (${u.current}).`)
  }

  const save = actions.saveSettings

  return (
    <Modal title="Settings" onClose={() => actions.openSettings(false)}>
      <div className="form">
        <h3>Audience output</h3>
        <label>
          Output screen
          <select
            value={settings.outputDisplayId ?? ''}
            onChange={(e) => void save({ outputDisplayId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Automatic (first non-main screen)</option>
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} — {d.width}×{d.height}
                {d.primary ? ' (main screen)' : ''}
              </option>
            ))}
          </select>
        </label>
        {displays.length < 2 && (
          <p className="hint">
            Only one screen is connected, so the output opens in a small window. Plug in a projector or TV and it goes
            full screen there automatically.
          </p>
        )}
        <label className="inline">
          <input type="checkbox" checked={settings.windowedOutput} onChange={(e) => void save({ windowedOutput: e.target.checked })} />
          Show output in a window (test mode, no projector needed)
        </label>
        <label>
          Fade time: {settings.transitionMs} ms
          <input
            type="range"
            min={0}
            max={1500}
            step={50}
            value={settings.transitionMs}
            onChange={(e) => void save({ transitionMs: +e.target.value })}
          />
        </label>

        <BibleSettings />

        <h3>Logo</h3>
        <p className="hint">Shown full screen when you press L (for example your church logo or announcements loop).</p>
        <MediaPicker value={settings.logoMedia} onChange={(logoMedia) => void save({ logoMedia })} />

        <h3>Backup</h3>
        <div className="row">
          <button onClick={() => void backup()}>Back up library…</button>
          <button onClick={() => void restore()}>Restore backup…</button>
        </div>

        <h3>Updates</h3>
        <label>
          GitHub repository for releases <span className="sub">(owner/repo)</span>
          <input
            placeholder="e.g. denverg50-sudo/KATY-Presenter"
            defaultValue={settings.updateRepo}
            onBlur={(e) => void save({ updateRepo: e.target.value.trim() })}
          />
        </label>
        <button onClick={() => void checkUpdates()}>Check for updates</button>
        {note && <p className="note">{note}</p>}
      </div>
    </Modal>
  )
}
