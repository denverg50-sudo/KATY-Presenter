// Renders build/icon.svg to build/icon.png (1024px) using Electron. Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '../build/icon.svg'), 'utf8')
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true,
    backgroundColor: '#00000000', webPreferences: { offscreen: true, zoomFactor: 1 } })
  await win.loadURL('data:text/html,' + encodeURIComponent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg', '<svg width="1024" height="1024"')}</body></html>`))
  await new Promise((r) => setTimeout(r, 300))
  const img = (await win.webContents.capturePage()).resize({ width: 1024, height: 1024 })
  fs.writeFileSync(path.join(__dirname, '../build/icon.png'), img.toPNG())
  fs.copyFileSync(path.join(__dirname, '../build/icon.png'), path.join(__dirname, '../resources/icon.png'))
  app.quit()
})
