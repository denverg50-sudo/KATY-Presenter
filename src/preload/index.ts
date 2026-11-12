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
  openExternal: (url) => ipcRenderer.send('open-external', url)
}

contextBridge.exposeInMainWorld('api', api)
