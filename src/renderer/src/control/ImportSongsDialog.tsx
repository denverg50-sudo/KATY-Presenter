import { useMemo, useState, type ReactNode } from 'react'
import type { SongImportPreview } from '@shared/types'
import { categoryLabel, defaultTicked, selectForImport, sourceSummary } from '@shared/songImport'
import { Modal } from './Modal'
import { actions } from './store'
import { ipcMessage } from './ImportBibleDialog'

/** Longest list rendered inside an expandable section, so a huge folder stays fast. */
const LIST_CAP = 500

const n = (x: number): string => x.toLocaleString('en-US')

function Expandable(props: { icon: string; tone?: string; label: string; lines: string[] }): ReactNode {
  const extra = props.lines.length - LIST_CAP
  const head = (
    <>
      <span className={`import-icon ${props.tone ?? ''}`}>{props.icon}</span>
      {props.label}
    </>
  )
  if (!props.lines.length) return <div className="import-line">{head}</div>
  return (
    <details className="import-line">
      <summary>{head}</summary>
      <ul>
        {props.lines.slice(0, LIST_CAP).map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        {extra > 0 && <li className="sub">and {n(extra)} more</li>}
      </ul>
    </details>
  )
}

export function ImportSongsDialog(props: { preview: SongImportPreview; onClose: () => void }) {
  const p = props.preview
  const categories = useMemo(() => {
    const counts = new Map<string | null, number>()
    for (const it of p.items) if (it.source === 'FreeShow') counts.set(it.category, (counts.get(it.category) ?? 0) + 1)
    return [...counts.entries()]
  }, [p.items])
  const [ticked, setTicked] = useState(() => new Set(categories.map(([c]) => c).filter(defaultTicked)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ imported: number; skipped: number } | null>(null)

  const { importKeys, duplicates, unticked } = useMemo(() => selectForImport(p.items, ticked), [p.items, ticked])
  const from = useMemo(() => sourceSummary(p.items, importKeys), [p.items, importKeys])
  const withNotes = useMemo(() => {
    const keys = new Set(importKeys)
    return p.items.filter((it) => keys.has(it.key) && it.notes.length > 0)
  }, [p.items, importKeys])

  const toggle = (c: string | null): void =>
    setTicked((t) => {
      const next = new Set(t)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  const close = (): void => {
    if (busy) return
    if (!done) void window.api.songImportCancel(p.token).catch(() => {})
    props.onClose()
  }
  const commit = async (): Promise<void> => {
    if (busy || !importKeys.length) return
    setBusy(true)
    setError('')
    try {
      const r = await window.api.songImportCommit(p.token, importKeys)
      setDone(r) // the songs are saved: never offer Import again, even if the reload below fails
      await actions.reloadSongs()
    } catch (e) {
      setError(ipcMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const count = importKeys.length
  return (
    <Modal
      title="Import songs"
      onClose={close}
      closeDisabled={busy}
      footer={
        done ? (
          <>
            <div className="spacer" />
            <button className="primary" onClick={close}>
              Done
            </button>
          </>
        ) : (
          <>
            {busy && (
              <span className="sub">
                <span className="spinner" />
                Importing…
              </span>
            )}
            <div className="spacer" />
            <button disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="primary" disabled={busy || count === 0} onClick={() => void commit()}>
              Import {n(count)} {count === 1 ? 'song' : 'songs'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="form import-summary">
          <p className="import-done">
            <span className="import-icon ok">✔</span>
            {n(done.imported)} {done.imported === 1 ? 'song' : 'songs'} added
          </p>
          {done.skipped > 0 && (
            <p className="hint">{n(done.skipped)} skipped because a song with the same title is already in your library.</p>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      ) : (
        <div className="form import-summary">
          <p className="import-read">
            Read {n(p.fileCount)} {p.fileCount === 1 ? 'file' : 'files'}
            {p.truncated && <span className="form-warn"> — stopped at 5,000 files</span>}
          </p>
          {from && <p className="import-from sub">From: {from}</p>}
          <div className="import-line">
            <span className="import-icon ok">✔</span>
            {n(count)} {count === 1 ? 'song' : 'songs'} ready to import
          </div>
          <Expandable
            icon="↷"
            label={`${n(duplicates.length)} already in your library or repeated`}
            lines={duplicates.map((d) => `${d.title} — ${d.file}`)}
          />
          {categories.length > 0 && (
            <Expandable
              icon="–"
              label={`${n(unticked.length)} not imported (category unticked)`}
              lines={unticked.map((d) => `${d.title} — ${d.file}`)}
            />
          )}
          <Expandable
            icon="⚠"
            tone="warn"
            label={`${n(withNotes.length)} imported with notes`}
            lines={withNotes.map((it) => `${it.title}: ${it.notes.join('; ')}`)}
          />
          <Expandable
            icon="✖"
            tone="bad"
            label={`${n(p.failed.length)} couldn't be read`}
            lines={p.failed.map((f) => `${f.file} — ${f.reason}`)}
          />
          <Expandable icon="·" label={`${n(p.ignored.length)} other files ignored`} lines={p.ignored} />

          {categories.length > 0 && (
            <div className="import-categories">
              <span className="seg-label">FreeShow categories</span>
              <div className="row checks">
                {categories.map(([c, k]) => (
                  <label key={c ?? '\u0000none'} className="inline" title={c ?? undefined}>
                    <input type="checkbox" disabled={busy} checked={ticked.has(c)} onChange={() => toggle(c)} />
                    {categoryLabel(c)} <span className="sub">({n(k)})</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
