import { useState } from 'react'
import type { ImportPreview } from '@shared/types'
import { Modal } from './Modal'
import { actions } from './store'
import { replaceTarget } from './bibleMessages'

/** Strip Electron's "Error invoking remote method 'x': Error: " prefix from IPC rejections. */
export function ipcMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}

export function ImportBibleDialog(props: { preview: ImportPreview; onClose: () => void }) {
  const p = props.preview
  const [name, setName] = useState(p.name)
  const [abbrev, setAbbrev] = useState(p.abbrev)
  const [replace, setReplace] = useState(!!p.replaceCandidate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Only offer Replace while the abbreviation still matches the existing Bible
  const target = replaceTarget(p.replaceCandidate, abbrev)
  const missing = p.missing.length > 0
  const missingText = p.missing.slice(0, 10).join(', ') + (p.missing.length > 10 ? ` and ${p.missing.length - 10} more` : '')

  const cancel = (): void => {
    if (busy) return
    void window.api.bibleImportCancel(p.token).catch(() => {})
    props.onClose()
  }
  const add = async (): Promise<void> => {
    if (busy) return
    if (!name.trim() || !abbrev.trim()) return setError('Name and abbreviation are required.')
    setBusy(true)
    setError('')
    try {
      await window.api.bibleImportCommit(p.token, {
        name: name.trim(),
        abbrev: abbrev.trim(),
        replaceId: replace && target ? target.id : null
      })
      await actions.refreshBibles()
      props.onClose()
    } catch (e) {
      setError(ipcMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Import Bible"
      onClose={cancel}
      footer={
        <>
          <button className="primary" disabled={busy} onClick={() => void add()}>
            {busy ? 'Adding…' : 'Add Bible'}
          </button>
          <button disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Abbreviation
          <input value={abbrev} onChange={(e) => setAbbrev(e.target.value)} />
        </label>
        <p className="hint">
          {p.bookCount.toLocaleString('en-US')} books · {p.chapterCount.toLocaleString('en-US')} chapters ·{' '}
          {p.verseCount.toLocaleString('en-US')} verses
        </p>
        {p.skipped.length > 0 && <p className="hint">Skipped: {p.skipped.join(', ')}</p>}
        {missing && <p className="form-warn">Some books are missing: {missingText}</p>}
        {target && (
          <div className="radio-col">
            <label className="inline">
              <input type="radio" checked={replace} onChange={() => setReplace(true)} />
              Replace existing “{target.abbrev}”
            </label>
            <label className="inline">
              <input type="radio" checked={!replace} onChange={() => setReplace(false)} />
              Add as new
            </label>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </Modal>
  )
}
