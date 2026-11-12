import { useState } from 'react'
import type { Background, Theme } from '@shared/types'
import { DEFAULT_THEME_ID } from '@shared/defaults'
import { SlideRenderer } from '../components/SlideRenderer'
import { Modal } from './Modal'
import { MediaPicker } from './MediaPicker'
import { actions, slidesOf, useStore } from './store'

const FONTS = [
  ['Helvetica Neue, Arial, sans-serif', 'Helvetica / Arial'],
  ['"Segoe UI", system-ui, sans-serif', 'Segoe UI / System'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['"Trebuchet MS", sans-serif', 'Trebuchet'],
  ['"Gill Sans", "Gill Sans MT", Calibri, sans-serif', 'Gill Sans / Calibri'],
  ['Futura, "Century Gothic", sans-serif', 'Futura / Century Gothic'],
  ['Georgia, serif', 'Georgia'],
  ['"Times New Roman", Times, serif', 'Times'],
  ['Palatino, "Palatino Linotype", "Book Antiqua", serif', 'Palatino'],
  ['Impact, Haettenschweiler, sans-serif', 'Impact'],
  ['"Brush Script MT", cursive', 'Brush Script']
]

const GRADIENTS = [
  'linear-gradient(135deg, #0b1d3a 0%, #1d4e89 55%, #3a7bd5 100%)',
  'linear-gradient(160deg, #2b1055 0%, #7597de 45%, #f6a35c 100%)',
  'radial-gradient(circle at 30% 20%, #3e7c59 0%, #1b3b2a 60%, #0c1a12 100%)',
  'linear-gradient(135deg, #200122 0%, #6f0000 100%)',
  'linear-gradient(180deg, #141e30 0%, #243b55 100%)',
  'radial-gradient(circle at 50% 120%, #f9d423 0%, #ff4e50 40%, #1a0a2e 85%)',
  'linear-gradient(135deg, #434343 0%, #000000 100%)',
  'linear-gradient(120deg, #0f2027 0%, #203a43 50%, #2c5364 100%)'
]

export function ThemeEditor() {
  const editing = useStore((s) => s.editingTheme)
  return editing ? <Editor key={editing.id} initial={editing} /> : null
}

function Editor({ initial }: { initial: Theme }) {
  const settings = useStore((s) => s.settings)!
  const exists = useStore((s) => s.themes.some((t) => t.id === initial.id))
  const sample = useStore((s) => slidesOf(s.songs.find((x) => x.id === s.selectedSongId))[0]?.text)
  const [t, setT] = useState(initial)
  const update = (p: Partial<Theme>): void => setT((x) => ({ ...x, ...p, updatedAt: Date.now() }))
  const bg = (p: Partial<Background>): void => update({ background: { ...t.background, ...p } })
  const isDefault = settings.defaultThemeId === t.id

  const close = (): void => actions.editTheme(null)
  const remove = (): void => {
    if (confirm(`Delete the theme “${t.name}”? Songs using it will switch to the default theme.`)) void actions.deleteTheme(t.id)
  }
  const duplicate = (): void => actions.editTheme({ ...t, id: crypto.randomUUID(), name: `${t.name} copy` })

  return (
    <Modal
      title={exists ? 'Edit theme' : 'New theme'}
      onClose={close}
      wide
      footer={
        <>
          {exists && t.id !== DEFAULT_THEME_ID && !isDefault && (
            <button className="ghost danger" onClick={remove}>
              Delete
            </button>
          )}
          {exists && <button onClick={duplicate}>Duplicate</button>}
          <label className="inline">
            <input
              type="checkbox"
              checked={isDefault}
              disabled={isDefault}
              onChange={() => void actions.saveSettings({ defaultThemeId: t.id })}
            />
            Default theme
          </label>
          <div className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void actions.saveTheme(t)}>
            Save theme
          </button>
        </>
      }
    >
      <div className="theme-editor">
        <div className="theme-preview">
          <SlideRenderer
            text={sample ?? 'Amazing grace, how sweet the sound\nThat saved a wretch like me'}
            theme={t}
            transitionMs={0}
          />
        </div>
        <div className="form theme-form scroll">
          <label>
            Name
            <input value={t.name} onChange={(e) => update({ name: e.target.value })} />
          </label>

          <h3>Text</h3>
          <div className="row">
            <label className="grow">
              Font
              <select value={t.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}>
                {FONTS.map(([v, n]) => (
                  <option key={v} value={v} style={{ fontFamily: v }}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input type="color" value={t.color} onChange={(e) => update({ color: e.target.value })} />
            </label>
          </div>
          <label>
            Max size: {t.fontSize}px <span className="sub">(long slides shrink automatically)</span>
            <input type="range" min={30} max={200} value={t.fontSize} onChange={(e) => update({ fontSize: +e.target.value })} />
          </label>
          <div className="row checks">
            <Check label="Bold" v={t.bold} on={(bold) => update({ bold })} />
            <Check label="Italic" v={t.italic} on={(italic) => update({ italic })} />
            <Check label="UPPERCASE" v={t.uppercase} on={(uppercase) => update({ uppercase })} />
            <Check label="Shadow" v={t.shadow} on={(shadow) => update({ shadow })} />
          </div>
          <div className="row">
            <Segmented
              label="Align"
              value={t.textAlign}
              options={[['left', '⇤'], ['center', '↔'], ['right', '⇥']]}
              on={(textAlign) => update({ textAlign })}
            />
            <Segmented
              label="Position"
              value={t.verticalAlign}
              options={[['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']]}
              on={(verticalAlign) => update({ verticalAlign })}
            />
          </div>
          <div className="row">
            <label className="grow">
              Line spacing: {t.lineHeight.toFixed(2)}
              <input type="range" min={0.9} max={2} step={0.05} value={t.lineHeight} onChange={(e) => update({ lineHeight: +e.target.value })} />
            </label>
            <label className="grow">
              Margin: {t.padding}%
              <input type="range" min={0} max={20} value={t.padding} onChange={(e) => update({ padding: +e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label className="grow">
              Outline: {t.outline}px
              <input type="range" min={0} max={12} value={t.outline} onChange={(e) => update({ outline: +e.target.value })} />
            </label>
            <label>
              Outline color
              <input type="color" value={t.outlineColor} onChange={(e) => update({ outlineColor: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <Check label="Band behind text (lower third)" v={t.band} on={(band) => update({ band })} />
            {t.band && (
              <label>
                Band color
                <input type="color" value={toHex(t.bandColor)} onChange={(e) => update({ bandColor: hexToRgba(e.target.value, 0.65) })} />
              </label>
            )}
          </div>

          <h3>Background</h3>
          <Segmented
            label="Type"
            value={t.background.type}
            options={[['color', 'Color'], ['gradient', 'Gradient'], ['image', 'Image'], ['video', 'Video']]}
            on={(type) => bg({ type })}
          />
          {t.background.type === 'color' && (
            <label>
              Color
              <input type="color" value={t.background.color} onChange={(e) => bg({ color: e.target.value })} />
            </label>
          )}
          {t.background.type === 'gradient' && (
            <div className="gradients">
              {GRADIENTS.map((g) => (
                <button
                  key={g}
                  className={`swatch ${t.background.gradient === g ? 'selected' : ''}`}
                  style={{ background: g }}
                  onClick={() => bg({ gradient: g })}
                />
              ))}
            </div>
          )}
          {(t.background.type === 'image' || t.background.type === 'video') && (
            <MediaPicker kind={t.background.type} value={t.background.media} onChange={(media) => bg({ media })} />
          )}
          <label>
            Darken background: {Math.round(t.background.dim * 100)}%
            <input type="range" min={0} max={0.9} step={0.05} value={t.background.dim} onChange={(e) => bg({ dim: +e.target.value })} />
          </label>
        </div>
      </div>
    </Modal>
  )
}

function Check(p: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="inline">
      <input type="checkbox" checked={p.v} onChange={(e) => p.on(e.target.checked)} />
      {p.label}
    </label>
  )
}

function Segmented<T extends string>(p: { label: string; value: T; options: [T, string][]; on: (v: T) => void }) {
  return (
    <div className="segmented-wrap">
      <span className="seg-label">{p.label}</span>
      <div className="segmented">
        {p.options.map(([v, n]) => (
          <button key={v} className={v === p.value ? 'active' : ''} onClick={() => p.on(v)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function toHex(c: string): string {
  if (c.startsWith('#')) return c.slice(0, 7)
  const m = c.match(/\d+/g)
  return m ? '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('') : '#000000'
}

function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
