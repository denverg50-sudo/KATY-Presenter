import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Background, Theme } from '@shared/types'
import { isVideo, mediaUrl } from '@shared/types'

export const CANVAS_W = 1920
export const CANVAS_H = 1080

interface Props {
  text: string | null
  theme: Theme | null
  black?: boolean
  logo?: boolean
  logoMedia?: string
  /** Fade time for text/background changes; 0 = instant */
  transitionMs?: number
  /** Thumbnails don't autoplay videos */
  thumbnail?: boolean
  className?: string
}

/**
 * Draws one slide on a fixed 1920x1080 canvas scaled to fit its container.
 * The same component is used for thumbnails, previews and the projector, so
 * what the operator sees is exactly what the audience sees.
 */
export function SlideRenderer(props: Props) {
  const { text, theme, black = false, logo = false, logoMedia = '', transitionMs = 0, thumbnail = false } = props
  const outer = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const el = outer.current!
    const measure = (): void => setScale(Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ms = transitionMs
  const style = { '--fade': `${ms}ms` } as CSSProperties

  return (
    <div ref={outer} className={`slide ${props.className ?? ''}`} style={style}>
      <div
        className="slide-canvas"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          visibility: scale ? 'visible' : 'hidden'
        }}
      >
        {theme && (
          <Crossfade k={bgKey(theme.background)} ms={ms}>
            <BackgroundLayer bg={theme.background} thumbnail={thumbnail} />
          </Crossfade>
        )}
        {theme && text && (
          <Crossfade k={`${theme.id}|${text}`} ms={ms}>
            <TextLayer text={text} theme={theme} />
          </Crossfade>
        )}
        <div className={`layer logo-layer ${logo ? 'on' : ''}`}>
          {logoMedia && <Media name={logoMedia} fit="contain" thumbnail={thumbnail} />}
        </div>
        <div className={`layer black-layer ${black || !theme ? 'on' : ''}`} />
      </div>
    </div>
  )
}

const bgKey = (b: Background): string => `${b.type}|${b.color}|${b.gradient}|${b.media}|${b.dim}`

/** Keeps the old content on screen while the new content fades in. */
function Crossfade({ k, ms, children }: { k: string; ms: number; children: ReactNode }) {
  const [leaving, setLeaving] = useState<{ k: string; node: ReactNode }[]>([])
  const prev = useRef({ k, node: children })

  useEffect(() => {
    if (prev.current.k !== k && ms > 0) {
      const old = prev.current
      setLeaving((l) => [...l.filter((x) => x.k !== k), old])
      const t = setTimeout(() => setLeaving((l) => l.filter((x) => x !== old)), ms)
      prev.current = { k, node: children }
      return () => clearTimeout(t)
    }
    prev.current = { k, node: children }
    return undefined
  }, [k, ms, children])

  return (
    <>
      {leaving.map((x) => (
        <div key={x.k} className="layer fade-out">
          {x.node}
        </div>
      ))}
      <div key={k} className={`layer ${ms > 0 ? 'fade-in' : ''}`}>
        {children}
      </div>
    </>
  )
}

function Media({ name, fit, thumbnail }: { name: string; fit: 'cover' | 'contain'; thumbnail: boolean }) {
  const src = mediaUrl(name)
  const style: CSSProperties = { width: '100%', height: '100%', objectFit: fit, display: 'block' }
  if (isVideo(name)) {
    return thumbnail ? (
      <video src={`${src}#t=1`} style={style} muted preload="metadata" />
    ) : (
      <video src={src} style={style} autoPlay loop muted playsInline />
    )
  }
  return <img src={src} style={style} alt="" draggable={false} />
}

function BackgroundLayer({ bg, thumbnail }: { bg: Background; thumbnail: boolean }) {
  const base: CSSProperties = { position: 'absolute', inset: 0, background: bg.color }
  if (bg.type === 'gradient' && bg.gradient) base.background = bg.gradient
  return (
    <div style={base}>
      {(bg.type === 'image' || bg.type === 'video') && bg.media && (
        <Media name={bg.media} fit="cover" thumbnail={thumbnail} />
      )}
      {bg.dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${bg.dim})` }} />}
    </div>
  )
}

const fitCache = new Map<string, number>()

function TextLayer({ text, theme }: { text: string; theme: Theme }) {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const cacheKey = `${theme.id}|${theme.updatedAt}|${theme.fontSize}|${text}`
  const [size, setSize] = useState(() => fitCache.get(cacheKey) ?? theme.fontSize)

  // Shrink the text until it fits inside the padded area (binary search)
  useLayoutEffect(() => {
    const cached = fitCache.get(cacheKey)
    if (cached) return setSize(cached)
    const b = box.current!
    const el = inner.current!
    const fits = (px: number): boolean => {
      el.style.fontSize = `${px}px`
      return el.scrollHeight <= b.clientHeight && el.scrollWidth <= b.clientWidth
    }
    let lo = 12
    let hi = Math.max(lo, theme.fontSize)
    if (fits(hi)) lo = hi
    else {
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        if (fits(mid)) lo = mid
        else hi = mid
      }
    }
    if (fitCache.size > 2000) fitCache.clear()
    fitCache.set(cacheKey, lo)
    el.style.fontSize = `${lo}px`
    setSize(lo)
  }, [cacheKey, theme.fontSize])

  const pad = (theme.padding / 100) * CANVAS_W
  const shadows: string[] = []
  if (theme.shadow) shadows.push('0 4px 18px rgba(0,0,0,0.85)', '0 2px 4px rgba(0,0,0,0.7)')

  const justify = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[theme.verticalAlign]

  return (
    <div
      className="text-area"
      style={{ padding: pad, justifyContent: justify }}
    >
      <div
        ref={box}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: justify }}
      >
        <div
          ref={inner}
          className="slide-text"
          style={{
            fontFamily: theme.fontFamily,
            fontSize: size,
            color: theme.color,
            fontWeight: theme.bold ? 700 : 400,
            fontStyle: theme.italic ? 'italic' : 'normal',
            textTransform: theme.uppercase ? 'uppercase' : 'none',
            textAlign: theme.textAlign,
            lineHeight: theme.lineHeight,
            textShadow: shadows.join(', ') || 'none',
            WebkitTextStroke: theme.outline ? `${theme.outline}px ${theme.outlineColor}` : undefined,
            paintOrder: 'stroke fill',
            background: theme.band ? theme.bandColor : undefined,
            padding: theme.band ? '0.35em 0.8em' : undefined,
            borderRadius: theme.band ? 12 : undefined
          }}
        >
          {text}
        </div>
      </div>
    </div>
  )
}
