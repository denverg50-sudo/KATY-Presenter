import { create } from 'zustand'
import type { LiveState, Service, Settings, Song, Theme } from '@shared/types'
import { buildSlides, type Slide } from '@shared/lyrics'
import { DEFAULT_THEME_ID, newSong } from '@shared/defaults'

const api = window.api

interface Live {
  songId: string
  /** Service item the song was launched from, so "next" can continue to the next song */
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

  selectedSongId: string | null
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

const byTitle = (a: { title?: string; name?: string }, b: { title?: string; name?: string }): number =>
  (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '', undefined, { sensitivity: 'base' })

export const useStore = create<State>(() => ({
  loaded: false,
  songs: [],
  themes: [],
  services: [],
  settings: null,
  media: [],
  selectedSongId: null,
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

export function themeFor(song: Song | undefined, s: Pick<State, 'themes' | 'settings'> = get()): Theme | null {
  const id = song?.themeId || s.settings?.defaultThemeId || DEFAULT_THEME_ID
  return s.themes.find((t) => t.id === id) ?? s.themes.find((t) => t.id === s.settings?.defaultThemeId) ?? s.themes[0] ?? null
}

export const currentService = (s: State = get()): Service | undefined => s.services.find((x) => x.id === s.serviceId)

export const actions = {
  async load() {
    const [songs, themes, services, settings, media] = await Promise.all([
      api.list<Song>('songs'),
      api.list<Theme>('themes'),
      api.list<Service>('services'),
      api.getSettings(),
      api.listMedia()
    ])
    services.sort((a, b) => b.updatedAt - a.updatedAt)
    set({
      loaded: true,
      songs: songs.sort(byTitle),
      themes: themes.sort(byTitle),
      services,
      settings,
      media,
      serviceId: get().serviceId ?? services[0]?.id ?? null
    })
  },

  // ---------- songs ----------
  selectSong(id: string | null, itemId: string | null = null) {
    set({ selectedSongId: id, selectedItemId: itemId })
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
      selectedSongId: saved.id,
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
      selectedSongId: s.selectedSongId === id ? null : s.selectedSongId,
      live: s.live?.songId === id ? null : s.live
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
  },
  async addToService(songId: string, at?: number) {
    let svc = currentService()
    if (!svc) {
      await actions.newService(defaultServiceName())
      svc = currentService()!
    }
    const items = [...svc.items]
    items.splice(at ?? items.length, 0, { id: crypto.randomUUID(), songId })
    await actions.saveService({ ...svc, items })
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
  goLive(songId: string, index: number, itemId: string | null = get().selectedItemId) {
    set({ live: { songId, index, itemId }, clear: false, black: false, logo: false })
  },
  step(dir: 1 | -1) {
    const s = get()
    if (!s.live) {
      if (s.selectedSongId) actions.goLive(s.selectedSongId, 0)
      return
    }
    const song = s.songs.find((x) => x.id === s.live!.songId)
    const count = slidesOf(song).length
    const index = s.live.index + dir
    if (index >= 0 && index < count) {
      set({ live: { ...s.live, index }, clear: false, black: false, logo: false })
      return
    }
    // Past the end of a song: continue to the neighbouring song in the service
    const svc = currentService(s)
    const pos = svc?.items.findIndex((i) => i.id === s.live!.itemId) ?? -1
    const item = pos >= 0 ? svc!.items[pos + dir] : undefined
    if (!item) return
    const nextSong = s.songs.find((x) => x.id === item.songId)
    const n = slidesOf(nextSong).length
    if (!nextSong || !n) return
    set({ selectedSongId: nextSong.id, selectedItemId: item.id })
    actions.goLive(nextSong.id, dir === 1 ? 0 : n - 1, item.id)
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
  const song = s.live ? s.songs.find((x) => x.id === s.live!.songId) : undefined
  const slide = slidesOf(song)[s.live?.index ?? -1]
  return {
    text: slide && !s.clear ? slide.text : null,
    theme: song ? themeFor(song, s) : null,
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
