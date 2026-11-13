import { useState } from 'react'
import type { BibleMeta, ImportPreview } from '@shared/types'
import { actions, useStore } from './store'
import { ImportBibleDialog, ipcMessage } from './ImportBibleDialog'

export function BibleSettings() {
  const bibles = useStore((s) => s.bibles)
  const services = useStore((s) => s.services)
  const themes = useStore((s) => s.themes)
  const settings = useStore((s) => s.settings)!
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const save = actions.saveSettings

  const pick = async (): Promise<void> => {
    if (importing) return
    setError('')
    setImporting(true)
    try {
      const r = await window.api.bibleImportPick()
      if (!r) return
      if ('error' in r) setError(r.error)
      else setPreview(r)
    } catch (e) {
      setError(ipcMessage(e))
    } finally {
      setImporting(false)
    }
  }

  const rename = async (b: BibleMeta, value: string): Promise<string> => {
    const abbrev = value.trim()
    if (!abbrev) {
      setError('Abbreviation can’t be empty.')
      return b.abbrev
    }
    if (abbrev === b.abbrev) return b.abbrev
    try {
      setError('')
      await window.api.bibleUpdate(b.id, { abbrev })
      await actions.refreshBibles()
      return abbrev
    } catch (e) {
      setError(ipcMessage(e))
      return b.abbrev
    }
  }

  const remove = async (b: BibleMeta): Promise<void> => {
    const n = services.reduce((t, s) => t + s.items.filter((i) => i.kind === 'scripture' && i.bibleId === b.id).length, 0)
    if (!confirm(`Delete “${b.name}”? It's used by ${n} passages in your services; they'll show “Bible not installed” until you pick another translation.`)) return
    try {
      setError('')
      await window.api.bibleRemove(b.id)
      if (settings.defaultBibleId === b.id) {
        const next = bibles.find((x) => x.id !== b.id)
        if (next) await save({ defaultBibleId: next.id })
      }
      await actions.refreshBibles()
    } catch (e) {
      setError(ipcMessage(e))
    }
  }

  return (
    <>
      <h3>Bibles</h3>
      <table className="bible-table">
        <tbody>
          {bibles.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td className="sub">{b.verseCount.toLocaleString('en-US')} verses</td>
              <td>
                <AbbrevInput bible={b} onCommit={(v) => rename(b, v)} />
              </td>
              <td className="act">
                {b.builtIn ? (
                  <span className="tag">Built-in</span>
                ) : (
                  <button className="icon" aria-label={`Delete ${b.name}`} onClick={() => void remove(b)}>
                    🗑
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button disabled={importing} onClick={() => void pick()}>
          {importing ? (
            <>
              <span className="spinner" />
              Importing…
            </>
          ) : (
            'Import Bible…'
          )}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      <label>
        Default translation
        <select value={settings.defaultBibleId} onChange={(e) => void save({ defaultBibleId: e.target.value })}>
          {bibles.map((b) => (
            <option key={b.id} value={b.id}>
              {b.abbrev} — {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Scripture theme
        <select value={settings.scriptureThemeId} onChange={(e) => void save({ scriptureThemeId: e.target.value })}>
          <option value="">Use default song theme</option>
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="segmented-wrap">
        <span className="seg-label">Verses per slide</span>
        <div className="segmented">
          {[1, 2, 3].map((n) => (
            <button key={n} className={settings.defaultVersesPerSlide === n ? 'active' : ''} onClick={() => void save({ defaultVersesPerSlide: n })}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <label className="inline">
        <input type="checkbox" checked={settings.showVerseNumbers} onChange={(e) => void save({ showVerseNumbers: e.target.checked })} />
        Show verse numbers
      </label>

      {preview && <ImportBibleDialog preview={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

/** Abbreviation field: saves on blur/Enter, reverts on Escape, ignores no-ops. */
function AbbrevInput(props: { bible: BibleMeta; onCommit: (v: string) => Promise<string> }) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? props.bible.abbrev
  const commit = async (): Promise<void> => {
    if (draft === null) return
    const v = draft
    setDraft(null)
    await props.onCommit(v)
  }
  return (
    <input
      aria-label={`Abbreviation for ${props.bible.name}`}
      value={value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}
