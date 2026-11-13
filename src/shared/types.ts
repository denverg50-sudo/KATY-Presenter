export type Kind = 'songs' | 'themes' | 'services'

export interface Song {
  id: string
  title: string
  author: string
  ccli: string
  copyright: string
  /** Raw lyrics with optional [Section] tags; blank lines split slides */
  lyrics: string
  /** e.g. "V1 C V2 C B C" — empty means order as written */
  arrangement: string
  /** Theme override; empty = use default theme */
  themeId: string
  updatedAt: number
}

export type BackgroundType = 'color' | 'gradient' | 'image' | 'video'

export interface Background {
  type: BackgroundType
  color: string
  /** CSS gradient, used when type = gradient */
  gradient: string
  /** File name inside the media library, used for image/video */
  media: string
  /** 0..1 darkening layer over the background so text stays readable */
  dim: number
}

export interface Theme {
  id: string
  name: string
  fontFamily: string
  /** Maximum font size in px on a 1920x1080 canvas; text shrinks to fit */
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  uppercase: boolean
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  lineHeight: number
  /** Padding around the text area, % of the screen */
  padding: number
  shadow: boolean
  /** Text outline width in px (0 = none) */
  outline: number
  outlineColor: string
  /** Show a band behind the text (lower-third style) */
  band: boolean
  bandColor: string
  background: Background
  updatedAt: number
}

export interface ServiceItem {
  id: string
  songId: string
}

export interface Service {
  id: string
  name: string
  items: ServiceItem[]
  updatedAt: number
}

export interface Settings {
  /** Electron display id for the audience output; null = first non-primary display */
  outputDisplayId: number | null
  /** Show the output in a normal window (for testing without a projector) */
  windowedOutput: boolean
  outputVisible: boolean
  defaultThemeId: string
  /** Media file shown when Logo is toggled */
  logoMedia: string
  transitionMs: number
  /** GitHub "owner/repo" checked for new releases; empty disables update checks */
  updateRepo: string
}

/** Everything the audience screen needs to draw a frame */
export interface LiveState {
  text: string | null
  theme: Theme | null
  black: boolean
  logo: boolean
  logoMedia: string
  transitionMs: number
}

export interface DisplayInfo {
  id: number
  label: string
  width: number
  height: number
  primary: boolean
}

export interface UpdateInfo {
  current: string
  latest: string
  url: string
  available: boolean
}

export interface Api {
  platform: string
  list<T>(kind: Kind): Promise<T[]>
  save<T extends { id: string }>(kind: Kind, item: T): Promise<void>
  remove(kind: Kind, id: string): Promise<void>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>
  importMedia(): Promise<string[]>
  listMedia(): Promise<string[]>
  listDisplays(): Promise<DisplayInfo[]>
  onDisplaysChanged(cb: () => void): () => void
  setLive(state: LiveState): void
  getLive(): Promise<LiveState | null>
  onLive(cb: (state: LiveState) => void): () => void
  exportBackup(): Promise<string | null>
  importBackup(): Promise<boolean>
  checkUpdate(): Promise<UpdateInfo | null>
  openExternal(url: string): void
}

export const mediaUrl = (name: string): string => `media://local/${encodeURIComponent(name)}`

export const isVideo = (name: string): boolean => /\.(mp4|webm|mov|m4v|ogv)$/i.test(name)

export interface BibleBook {
  num: number
  chapters: string[][]
}

export interface Bible {
  id: string
  name: string
  abbrev: string
  builtIn: boolean
  source: string
  books: BibleBook[]
}

export interface BibleMeta {
  id: string
  name: string
  abbrev: string
  builtIn: boolean
  source: string
  bookCount: number
  verseCount: number
}

export interface PassageVerse {
  book: number
  c: number
  v: number
  text: string
  range?: number // index into the reference's ranges (set by getPassage)
}

export interface Passage {
  bibleId: string
  abbrev: string
  reference: string
  verses: PassageVerse[]
}
