import { BrowserWindow, screen, shell, type Display } from 'electron'
import path from 'path'
import type { DisplayInfo, LiveState, Settings } from '../shared/types'

let control: BrowserWindow | null = null
let output: BrowserWindow | null = null
let lastLive: LiveState | null = null
let settings: Settings
let outputFramed = false

const preload = path.join(__dirname, '../preload/index.js')
const icon = path.join(__dirname, '../../resources/icon.png')

function load(win: BrowserWindow, hash: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}#${hash}`)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash })
}

function secure(win: BrowserWindow): void {
  // Open links in the user's browser; never navigate the app window away
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'file://')) e.preventDefault()
  })
}

export function createControlWindow(): BrowserWindow {
  control = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#15171c',
    title: 'Katy-Presenter',
    icon,
    webPreferences: { preload, sandbox: true, contextIsolation: true }
  })
  secure(control)
  control.once('ready-to-show', () => control?.show())
  control.on('closed', () => {
    control = null
    output?.destroy()
    output = null
  })
  load(control, 'control')
  return control
}

export function listDisplays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: d.label || `Display ${i + 1}`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === primary
  }))
}

function targetDisplay(): Display {
  const all = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  return (
    all.find((d) => d.id === settings.outputDisplayId) ??
    all.find((d) => d.id !== primary.id) ??
    primary
  )
}

/** Create, move or hide the audience window to match the current settings. */
export function applyOutput(next: Settings): void {
  settings = next
  if (!control) return
  if (!settings.outputVisible) {
    output?.destroy()
    output = null
    return
  }
  const display = targetDisplay()
  const onlyOneScreen = screen.getAllDisplays().length === 1
  // With a single screen, never cover the operator's view: fall back to a window
  const windowed = settings.windowedOutput || onlyOneScreen

  // A frame can't be added/removed on an existing window, so rebuild when it must change
  if (output && outputFramed !== windowed) {
    output.destroy()
    output = null
  }

  if (!output) {
    outputFramed = windowed
    output = new BrowserWindow({
      show: false,
      frame: windowed,
      backgroundColor: '#000000',
      title: 'Katy-Presenter Output',
      icon,
      enableLargerThanScreen: true,
      webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false }
    })
    secure(output)
    output.on('closed', () => (output = null))
    output.once('ready-to-show', () => output?.showInactive())
    load(output, 'output')
  }

  if (windowed) {
    output.setAlwaysOnTop(false)
    const { x, y, width } = display.workArea
    output.setBounds({ x: x + width - 680, y: y + 40, width: 640, height: 360 })
    output.setAspectRatio(16 / 9)
  } else {
    output.setAspectRatio(0)
    output.setBounds(display.bounds)
    // On macOS, native full screen creates a separate Space; covering the display is smoother
    if (process.platform !== 'darwin') output.setFullScreen(true)
    output.setAlwaysOnTop(true, 'screen-saver')
    output.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
}

export function setLive(state: LiveState): void {
  lastLive = state
  output?.webContents.send('live:update', state)
}

export const getLive = (): LiveState | null => lastLive

export function broadcast(channel: string): void {
  control?.webContents.send(channel)
}

export const getControl = (): BrowserWindow | null => control
export const getOutput = (): BrowserWindow | null => output
