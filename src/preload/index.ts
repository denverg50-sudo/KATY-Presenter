import { contextBridge, ipcRenderer } from 'electron'
import type { Api, LiveState } from '../shared/types'

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const listener = (_e: unknown, v: T): void => cb(v)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  platform: process.platform,
  list: (kind) => ipcRenderer.invoke('db:list', kind),
  save: (kind, item) => ipcRenderer.invoke('db:save', kind, item),
  remove: (kind, id) => ipcRenderer.invoke('db:remove', kind, id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  importMedia: () => ipcRenderer.invoke('media:import'),
  listMedia: () => ipcRenderer.invoke('media:list'),
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  onDisplaysChanged: (cb) => subscribe('displays:changed', cb),
  setLive: (state) => ipcRenderer.send('live:set', state),
  getLive: () => ipcRenderer.invoke('live:get'),
  onLive: (cb) => subscribe<LiveState>('live:update', cb),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  listBibles: () => ipcRenderer.invoke('bible:list'),
  biblePassage: (id, ref) => ipcRenderer.invoke('bible:passage', id, ref),
  bibleSearch: (id, q) => ipcRenderer.invoke('bible:search', id, q),
  bibleImportPick: () => ipcRenderer.invoke('bible:import-pick'),
  bibleImportCancel: (token) => ipcRenderer.invoke('bible:import-cancel', token),
  bibleImportCommit: (token, opts) => ipcRenderer.invoke('bible:import-commit', token, opts),
  bibleUpdate: (id, patch) => ipcRenderer.invoke('bible:update', id, patch),
  bibleRemove: (id) => ipcRenderer.invoke('bible:remove', id),
  songImportPick: (mode) => ipcRenderer.invoke('song:import-pick', mode),
  songImportCommit: (token, keys) => ipcRenderer.invoke('song:import-commit', token, keys),
  songImportCancel: (token) => ipcRenderer.invoke('song:import-cancel', token)
}

contextBridge.exposeInMainWorld('api', api)
