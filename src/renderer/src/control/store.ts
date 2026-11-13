import { create } from 'zustand'
import type { BibleMeta, LiveState, Passage, Service, ServiceItem, Settings, Song, Theme } from '@shared/types'
import { buildSlides, type Slide } from '@shared/lyrics'
import { buildScriptureSlides, type ScriptureSlide } from '@shared/scripture'
import { DEFAULT_THEME_ID, newSong } from '@shared/defaults'
import { asVersesPerSlide, fromServiceItem, passageKey, toServiceItem, type Presentable } from './presentable'

type ScripturePresentable = Extract<Presentable, { kind: 'scripture' }>

export type { Presentable } from './presentable'

const api = window.api

interface Live {
  item: Presentable
  /** Service item this was launched from, so "next" can continue to the next item */
  itemId: string | null
  index: number
}

interface State {
  loaded: boolean
  songs: Song[]
  themes: Theme[]
  services: Service[]
  settings: Settings | null
  media: string[]
  bibles: BibleMeta[]
  /** Looked-up passages by passageKey(bibleId, ref) */
  passages: Record<string, Passage | { error: string }>

  selected: Presentable | null
  selectedItemId: string | null
  serviceId: string | null
  live: Live | null
  black: boolean
  clear: boolean
  logo: boolean

  editingSong: Song | null
  editingTheme: Theme | null
  showSettings: boolean
}

const slideCache = new WeakMap<Song, Slide[]>()
export function slidesOf(song: Song | undefined): Slide[] {
  if (!song) return []
  let s = slideCache.get(song)
  if (!s) slideCache.set(song, (s = buildSlides(song.lyrics, song.arrangement)))
  return s
}

const NO_SLIDES: ScriptureSlide[] = []
const scriptureCache = new WeakMap<Passage, Map<string, ScriptureSlide[]>>()

type SlideSource = Pick<State, 'songs' | 'bibles' | 'passages' | 'settings'>

/** Passage for a scripture item, or undefined while loading / when the lookup failed or the Bible is gone. */
export function passageFor(p: Presentable | null | undefined, s: SlideSource = get()): Passage | undefined {
  if (p?.kind !== 'scripture' || !s.bibles.some((b) => b.id === p.bibleId)) return undefined
  const found = s.passages[passageKey(p.bibleId, p.ref)]
  return found && !('error' in found) ? found : undefined
}

/** Slides for anything presentable, from the cache (never fetches). Same array for the same inputs. */
export function slidesFor(p: Presentable | null | undefined, s: SlideSource = get()): Slide[] | ScriptureSlide[] {
  if (!p) return NO_SLIDES
  if (p.kind === 'song') return slidesOf(s.songs.find((x) => x.id === p.songId))
  const passage = passageFor(p, s)
  if (!passage) return NO_SLIDES
  const numbers = s.settings?.showVerseNumbers ?? true
  const key = `${p.versesPerSlide}|${numbers}`
  let byLayout = scriptureCache.get(passage)
  if (!byLayout) scriptureCache.set(passage, (byLayout = new Map()))
  let slides = byLayout.get(key)
  if (!slides) byLayout.set(key, (slides = buildScriptureSlides(passage, p.versesPerSlide, numbers)))
  return slides
}

/** Display name: song title or passage reference. */
export function titleOf(p: Presentable | null | undefined, s: SlideSource = get()): string {
  if (!p) return ''
  if (p.kind === 'song') return s.songs.find((x) => x.id === p.songId)?.title ?? ''
  const passage = passageFor(p, s)
  return passage ? `${passage.reference} (${passage.abbrev})` : p.ref
}

export const samePresentable = (a: Presentable | null | undefined, b: Presentable | null | undefined): boolean =>
  !!a &&
  !!b &&
  (a.kind === 'song'
    ? b.kind === 'song' && a.songId === b.songId
    : b.kind === 'scripture' &&
      a.bibleId === b.bibleId &&
      a.ref === b.ref &&
      a.versesPerSlide === b.versesPerSlide &&
      a.themeId === b.themeId)

export function itemPresentable(item: ServiceItem, s: Pick<State, 'settings'> = get()): Presentable {
  return fromServiceItem(item, { versesPerSlide: asVersesPerSlide(s.settings?.defaultVersesPerSlide) })
}

const byTitle = (a: { title?: string; name?: string }, b: { title?: string; name?: string }): number =>
  (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '', undefined, { sensitivity: 'base' })

export const useStore = create<State>(() => ({
  loaded: false,
  songs: [],
  themes: [],
  services: [],
  settings: null,
  media: [],
  bibles: [],
  passages: {},
  selected: null,
  selectedItemId: null,
  serviceId: null,
  live: null,
  black: false,
  clear: false,
  logo: false,
  editingSong: null,
  editingTheme: null,
  showSettings: false
}))

const set = useStore.setState
const get = useStore.getState

export function themeFor(
  p: Presentable | null | undefined,
  s: Pick<State, 'themes' | 'settings' | 'songs'> = get()
): Theme | null {
  const own =
    p?.kind === 'song'
      ? s.songs.find((x) => x.id === p.songId)?.themeId
      : p?.kind === 'scripture'
        ? p.themeId || s.settings?.scriptureThemeId
        : undefined
  const id = own || s.settings?.defaultThemeId || DEFAULT_THEME_ID
  return s.themes.find((t) => t.id === id) ?? s.themes.find((t) => t.id === s.settings?.defaultThemeId) ?? s.themes[0] ?? null
}

export const currentService = (s: State = get()): Service | undefined => s.services.find((x) => x.id === s.serviceId)

/**
 * The first service item after (dir 1) or before (dir -1) `itemId` that has slides.
 * Items with none (missing song or Bible, failed lookup, empty lyrics) are skipped.
 * With `pending`, a scripture item whose passage is still loading stops the search there.
 */
export function neighbour(
  s: State,
  itemId: string | null,
  dir: 1 | -1
): { item: ServiceItem; p: Presentable; slides: Slide[] } | { pending: Presentable } | null {
  const svc = currentService(s)
  const pos = svc?.items.findIndex((i) => i.id === itemId) ?? -1
  if (!svc || pos < 0) return null
  for (let i = pos + dir; i >= 0 && i < svc.items.length; i += dir) {
    const item = svc.items[i]
    const p = itemPresentable(item, s)
    if (isLoading(p, s)) return { pending: p }
    const slides = slidesFor(p, s)
    if (slides.length) return { item, p, slides }
  }
  return null
}

/** A scripture passage whose Bible is installed but whose lookup hasn't come back yet. */
function isLoading(p: Presentable, s: Pick<State, 'bibles' | 'passages'>): boolean {
  return p.kind === 'scripture' && s.bibles.some((b) => b.id === p.bibleId) && !(passageKey(p.bibleId, p.ref) in s.passages)
}

const inflight = new Map<string, Promise<void>>()

function ensureFor(p: Presentable | null | undefined): Promise<void> {
  return p?.kind === 'scripture' ? actions.ensurePassage(p.bibleId, p.ref) : Promise.resolve()
}

function ensureService(svc: Service | undefined): void {
  for (const item of svc?.items ?? []) if (item.kind === 'scripture') void ensureFor(itemPresentable(item))
}

export const actions = {
  async load() {
    const [songs, themes, services, settings, media, bibles] = await Promise.all([
      api.list<Song>('songs'),
      api.list<Theme>('themes'),
      api.list<Service>('services'),
      api.getSettings(),
      api.listMedia(),
      api.listBibles()
    ])
    services.sort((a, b) => b.updatedAt - a.updatedAt)
    set({
      loaded: true,
      songs: songs.sort(byTitle),
      themes: themes.sort(byTitle),
      services,
      settings,
      media,
      bibles,
      serviceId: get().serviceId ?? services[0]?.id ?? null
    })
    ensureService(currentService())
  },

  // ---------- Bibles ----------
  /** Reload the installed Bibles (after import, rename or delete). Passages of changed Bibles are looked up again. */
  async refreshBibles() {
    const bibles = await api.listBibles()
    const before = new Map(get().bibles.map((b) => [b.id, b]))
    const changed = new Set<string>()
    for (const b of bibles) {
      const old = before.get(b.id)
      if (!old || old.abbrev !== b.abbrev || old.name !== b.name || old.verseCount !== b.verseCount) changed.add(b.id)
      before.delete(b.id)
    }
    for (const id of before.keys()) changed.add(id) // removed
    set((s) => {
      const passages = Object.fromEntries(
        Object.entries(s.passages).filter(([key]) => !changed.has(key.slice(0, key.indexOf('|'))))
      )
      return { bibles, passages }
    })
    for (const key of [...inflight.keys()]) if (changed.has(key.slice(0, key.indexOf('|')))) inflight.delete(key)
    const s = get()
    ensureService(currentService(s))
    void ensureFor(s.selected)
    void ensureFor(s.live?.item)
  },
  /** Look up a passage once and cache it (including lookup errors). Does nothing for a Bible that isn't installed. */
  ensurePassage(bibleId: string, ref: string): Promise<void> {
    const key = passageKey(bibleId, ref)
    if (key in get().passages || !get().bibles.some((b) => b.id === bibleId)) return Promise.resolve()
    let pending = inflight.get(key)
    if (!pending) {
      pending = api
        .biblePassage(bibleId, ref)
        .catch((e: unknown) => ({ error: String(e) }))
        .then((result) => {
          if (inflight.get(key) !== pending) return // invalidated by refreshBibles meanwhile
          inflight.delete(key)
          set((s) => ({ passages: { ...s.passages, [key]: result } }))
        })
      inflight.set(key, pending)
    }
    return pending
  },

  // ---------- selection ----------
  select(p: Presentable | null, itemId: string | null = null) {
    set({ selected: p, selectedItemId: itemId })
    void ensureFor(p)
  },
  selectItem(item: ServiceItem) {
    actions.select(itemPresentable(item), item.id)
  },

  /**
   * Change the selected passage's translation, layout or theme. When it was opened from a service item,
   * the item is updated too. Whatever is live keeps showing until the operator picks a slide again.
   */
  async updateSelectedScripture(patch: Partial<Pick<ScripturePresentable, 'bibleId' | 'themeId' | 'versesPerSlide'>>) {
    const s = get()
    if (s.selected?.kind !== 'scripture') return
    const next: ScripturePresentable = { ...s.selected, ...patch }
    actions.select(next, s.selectedItemId)
    const svc = currentService(s)
    const item = svc?.items.find((i) => i.id === s.selectedItemId)
    if (svc && item?.kind === 'scripture') {
      await actions.saveService({ ...svc, items: svc.items.map((i) => (i === item ? toServiceItem(next, i.id) : i)) })
    }
  },
  /** Point a scripture service item at another Bible (e.g. after its Bible was deleted). */
  async repointItem(itemId: string, bibleId: string) {
    const svc = currentService()
    const item = svc?.items.find((i) => i.id === itemId)
    if (!svc || item?.kind !== 'scripture') return
    const updated = { ...item, bibleId }
    await actions.saveService({ ...svc, items: svc.items.map((i) => (i === item ? updated : i)) })
    if (get().selectedItemId === itemId) actions.selectItem(updated)
    else void ensureFor(itemPresentable(updated))
  },

  // ---------- songs ----------
  selectSong(id: string | null, itemId: string | null = null) {
    actions.select(id ? { kind: 'song', songId: id } : null, itemId)
  },
  newSong() {
    set({ editingSong: newSong() })
  },
  editSong(song: Song) {
    set({ editingSong: { ...song } })
  },
  async saveSong(song: Song) {
    const saved = { ...song, title: song.title.trim() || 'Untitled song', updatedAt: Date.now() }
    await api.save('songs', saved)
    set((s) => ({
      songs: [...s.songs.filter((x) => x.id !== saved.id), saved].sort(byTitle),
      selected: { kind: 'song', songId: saved.id },
      editingSong: null
    }))
  },
  async setSongTheme(song: Song, themeId: string) {
    await actions.saveSong({ ...song, themeId })
  },
  async deleteSong(id: string) {
    await api.remove('songs', id)
    const services = get().services.map((svc) =>
      svc.items.some((i) => i.songId === id) ? { ...svc, items: svc.items.filter((i) => i.songId !== id) } : svc
    )
    for (const svc of services) if (svc !== get().services.find((x) => x.id === svc.id)) await api.save('services', svc)
    set((s) => ({
      songs: s.songs.filter((x) => x.id !== id),
      services,
      selected: s.selected?.kind === 'song' && s.selected.songId === id ? null : s.selected,
      live: s.live?.item.kind === 'song' && s.live.item.songId === id ? null : s.live
    }))
  },

  // ---------- services (playlists) ----------
  async saveService(svc: Service) {
    const saved = { ...svc, updatedAt: Date.now() }
    await api.save('services', saved)
    set((s) => ({ services: s.services.map((x) => (x.id === saved.id ? saved : x)) }))
  },
  async newService(name: string) {
    const svc: Service = { id: crypto.randomUUID(), name, items: [], updatedAt: Date.now() }
    await api.save('services', svc)
    set((s) => ({ services: [svc, ...s.services], serviceId: svc.id }))
  },
  async deleteService(id: string) {
    await api.remove('services', id)
    set((s) => {
      const services = s.services.filter((x) => x.id !== id)
      return { services, serviceId: s.serviceId === id ? services[0]?.id ?? null : s.serviceId }
    })
  },
  selectService(id: string) {
    set({ serviceId: id, selectedItemId: null })
    ensureService(currentService())
  },
  /** Add a song (by id) or any presentable item to the current service, creating one if needed. */
  async addToService(what: string | Presentable, at?: number) {
    const p: Presentable = typeof what === 'string' ? { kind: 'song', songId: what } : what
    let svc = currentService()
    if (!svc) {
      await actions.newService(defaultServiceName())
      svc = currentService()!
    }
    const items = [...svc.items]
    items.splice(at ?? items.length, 0, toServiceItem(p, crypto.randomUUID()))
    await actions.saveService({ ...svc, items })
    void ensureFor(p)
  },
  async moveItem(itemId: string, to: number) {
    const svc = currentService()
    if (!svc) return
    const items = [...svc.items]
    const from = items.findIndex((i) => i.id === itemId)
    if (from < 0) return
    const [it] = items.splice(from, 1)
    items.splice(Math.max(0, Math.min(items.length, to > from ? to - 1 : to)), 0, it)
    await actions.saveService({ ...svc, items })
  },
  async removeItem(itemId: string) {
    const svc = currentService()
    if (!svc) return
    await actions.saveService({ ...svc, items: svc.items.filter((i) => i.id !== itemId) })
  },

  // ---------- live control ----------
  goLive(item: Presentable, index: number, itemId: string | null = get().selectedItemId) {
    set({ live: { item, index, itemId }, clear: false, black: false, logo: false })
    void ensureFor(item)
  },
  /** Next/previous slide; past either end it continues into the neighbouring service item. */
  async step(dir: 1 | -1): Promise<void> {
    const s = get()
    if (!s.live) {
      if (s.selected) actions.goLive(s.selected, 0)
      return
    }
    const count = slidesFor(s.live.item, s).length
    const index = s.live.index + dir
    if (index >= 0 && index < count) {
      set({ live: { ...s.live, index }, clear: false, black: false, logo: false })
      return
    }
    // Past the end: continue to the neighbouring item in the service, waiting for passages still loading
    const startLive = s.live
    let next = neighbour(s, startLive.itemId, dir)
    while (next && 'pending' in next) {
      await ensureFor(next.pending)
      if (get().live !== startLive) return // something else went live meanwhile
      next = neighbour(get(), startLive.itemId, dir)
    }
    if (!next) return
    set({ selected: next.p, selectedItemId: next.item.id })
    actions.goLive(next.p, dir === 1 ? 0 : next.slides.length - 1, next.item.id)
  },
  toggle(flag: 'black' | 'clear' | 'logo') {
    set((s) => ({ [flag]: !s[flag] }) as Partial<State>)
  },
  clearAll() {
    set({ live: null, black: false, clear: false, logo: false })
  },

  // ---------- themes ----------
  editTheme(theme: Theme | null) {
    set({ editingTheme: theme ? structuredClone(theme) : null })
  },
  async saveTheme(theme: Theme) {
    const saved = { ...theme, name: theme.name.trim() || 'Untitled theme', updatedAt: Date.now() }
    await api.save('themes', saved)
    set((s) => ({ themes: [...s.themes.filter((x) => x.id !== saved.id), saved].sort(byTitle), editingTheme: null }))
  },
  async deleteTheme(id: string) {
    await api.remove('themes', id)
    set((s) => ({ themes: s.themes.filter((x) => x.id !== id), editingTheme: null }))
  },

  // ---------- settings & media ----------
  async saveSettings(patch: Partial<Settings>) {
    const settings = await api.saveSettings({ ...get().settings!, ...patch })
    set({ settings })
  },
  async importMedia(): Promise<string[]> {
    const added = await api.importMedia()
    if (added.length) set({ media: await api.listMedia() })
    return added
  },
  openSettings(show: boolean) {
    set({ showSettings: show })
  }
}

export function defaultServiceName(): string {
  return `Service ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** What the audience should see right now, derived from the control state. */
export function liveState(s: State): LiveState {
  const item = s.live?.item
  const slide: Slide | ScriptureSlide | undefined = slidesFor(item, s)[s.live?.index ?? -1]
  const show = !!slide && !s.clear
  return {
    text: show ? slide.text : null,
    footer: show && 'footer' in slide ? slide.footer : null,
    // A live song that no longer exists has no theme (as before); scripture keeps its theme while loading
    theme: item && (item.kind === 'scripture' || s.songs.some((x) => x.id === item.songId)) ? themeFor(item, s) : null,
    black: s.black,
    logo: s.logo,
    logoMedia: s.settings?.logoMedia ?? '',
    transitionMs: s.settings?.transitionMs ?? 400
  }
}

// Push every change of the live picture to the projector window
let lastSent = ''
useStore.subscribe((s) => {
  if (!s.loaded) return
  const state = liveState(s)
  const json = JSON.stringify(state)
  if (json !== lastSent) {
    lastSent = json
    api.setLive(state)
  }
})
