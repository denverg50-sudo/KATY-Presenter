import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, shell } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
import { Storage } from './storage'
import { BibleStore } from './bible/store'
import { SongImporter } from './songs/importer'
import { parseSongsInBackground } from './songs/background'
import { SONG_EXTENSIONS } from './songs/scan'
import {
  applyOutput,
  broadcast,
  createControlWindow,
  getControl,
  getLive,
  listDisplays,
  setLive
} from './windows'
import { checkForUpdate } from './update'
import { runSmoke, smokeSetup } from './smoke'
import type { Kind, LiveState, Settings } from '../shared/types'

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

// One copy of the app at a time; a second launch focuses the first
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  const win = getControl()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

const smokeDir = smokeSetup()
const storage = new Storage(path.join(app.getPath('userData'), 'library'))
const songImporter = new SongImporter(storage, parseSongsInBackground)
// Built-in Bibles ship in resources/ (asar-unpacked); Task 7 wires this store to IPC.
export const bibleStore = new BibleStore(path.join(app.getPath('userData'), 'library'), path.join(__dirname, '../../resources/bibles'))

const MEDIA_FILTERS = [
  { name: 'Images & videos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'm4v'] }
]

function registerIpc(): void {
  ipcMain.handle('db:list', (_e, kind: Kind) => storage.list(kind))
  ipcMain.handle('db:save', (_e, kind: Kind, item: { id: string }) => storage.save(kind, item))
  ipcMain.handle('db:remove', (_e, kind: Kind, id: string) => storage.remove(kind, id))

  ipcMain.handle('settings:get', () => storage.getSettings())
  ipcMain.handle('settings:save', async (_e, s: Settings) => {
    const saved = await storage.saveSettings(s)
    applyOutput(saved)
    return saved
  })

  ipcMain.handle('media:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Add backgrounds',
      properties: ['openFile', 'multiSelections'],
      filters: MEDIA_FILTERS
    })
    return r.canceled ? [] : storage.importMedia(r.filePaths)
  })
  ipcMain.handle('media:list', () => storage.listMedia())

  ipcMain.handle('displays:list', () => listDisplays())

  ipcMain.on('live:set', (_e, state: LiveState) => setLive(state))
  ipcMain.handle('live:get', () => getLive())

  ipcMain.handle('backup:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const stamp = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(win, {
      title: 'Back up library',
      defaultPath: `Katy-Presenter Backup ${stamp}.zip`,
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (r.canceled || !r.filePath) return null
    await storage.exportZip(r.filePath)
    return r.filePath
  })
  ipcMain.handle('backup:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Restore backup',
      properties: ['openFile'],
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    })
    if (r.canceled || !r.filePaths[0]) return false
    await storage.importZip(r.filePaths[0])
    bibleStore.reset()
    return true
  })

  ipcMain.handle('bible:list', () => bibleStore.list())
  ipcMain.handle('bible:passage', (_e, id: string, ref: string) => bibleStore.passage(id, ref))
  ipcMain.handle('bible:search', (_e, id: string, q: string) => bibleStore.search(id, q))
  ipcMain.handle('bible:import-pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: 'Import Bible',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Bible files', extensions: ['xml', 'xmm', 'zefania', 'osis', 'usfx', 'sqlite', 'csv'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (r.canceled || r.filePaths.length === 0) return null
    return bibleStore.prepareImport(r.filePaths)
  })
  ipcMain.handle('bible:import-cancel', (_e, token: string) => bibleStore.cancelImport(token))
  ipcMain.handle('bible:import-commit', (_e, token: string, opts: { name: string; abbrev: string; replaceId: string | null }) =>
    bibleStore.commitImport(token, opts)
  )
  ipcMain.handle('song:import-pick', async (e, mode: 'folder' | 'files') => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(
      win,
      mode === 'folder'
        ? { title: 'Import songs from a folder', properties: ['openDirectory'] }
        : {
            title: 'Import song files',
            properties: ['openFile', 'multiSelections'],
            filters: [
              { name: 'Song files', extensions: SONG_EXTENSIONS.map((x) => x.replace(/^\./, '')) },
              { name: 'All files', extensions: ['*'] }
            ]
          }
    )
    if (r.canceled || r.filePaths.length === 0) return null
    return songImporter.prepare(r.filePaths)
  })
  ipcMain.handle('song:import-commit', (_e, token: unknown, keys: unknown) => {
    if (typeof token !== 'string' || !Array.isArray(keys) || !keys.every((k) => typeof k === 'string')) {
      throw new Error('Invalid import request')
    }
    return songImporter.commit(token, keys)
  })
  ipcMain.handle('song:import-cancel', (_e, token: unknown) => {
    if (typeof token !== 'string') throw new Error('Invalid import request')
    songImporter.cancel(token)
  })
  ipcMain.handle('bible:update', (_e, id: string, patch: { name?: string; abbrev?: string }) => bibleStore.update(id, patch))
  ipcMain.handle('bible:remove', (_e, id: string) => bibleStore.remove(id))

  ipcMain.handle('update:check', async () => checkForUpdate((await storage.getSettings()).updateRepo))
  ipcMain.on('open-external', (_e, url: string) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
  })
}

app.whenReady().then(async () => {
  await storage.init()

  protocol.handle('media', (req) => {
    const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
    const file = storage.mediaPath(name)
    if (!file) return new Response('Not found', { status: 404 })
    // Forward Range headers so videos can stream and loop
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers })
  })

  registerIpc()
  createControlWindow()
  applyOutput(await storage.getSettings())

  const onDisplays = async (): Promise<void> => {
    applyOutput(await storage.getSettings())
    broadcast('displays:changed')
  }
  screen.on('display-added', onDisplays)
  screen.on('display-removed', onDisplays)
  screen.on('display-metrics-changed', onDisplays)

  if (smokeDir) void runSmoke(smokeDir)

  app.on('activate', async () => {
    if (!getControl()) {
      createControlWindow()
      applyOutput(await storage.getSettings())
    }
  })
})

app.on('window-all-closed', () => app.quit())
