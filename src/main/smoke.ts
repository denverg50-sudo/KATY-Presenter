import { app, dialog } from 'electron'
import { getControl, getOutput } from './windows'
import { promises as fs } from 'fs'
import path from 'path'

/**
 * Dev-only visual smoke test: `KATY_SMOKE=/some/dir npm run dev`
 * Uses a throwaway library, drives the UI, saves screenshots of every window, then quits.
 */
export function smokeSetup(): string | null {
  const dir = process.env['KATY_SMOKE']
  if (!dir || app.isPackaged) return null
  app.setPath('userData', path.join(dir, 'userdata'))
  return dir
}

export async function runSmoke(dir: string): Promise<void> {
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  await wait(2500)
  const control = getControl()!
  const js = (code: string): Promise<unknown> => control.webContents.executeJavaScript(code)
  const shoot = async (name: string): Promise<void> => {
    const wins = { control, output: getOutput() }
    for (const [kind, w] of Object.entries(wins)) {
      if (!w) continue
      const img = await w.webContents.capturePage()
      await fs.writeFile(path.join(dir, `${name}-${kind}.png`), img.toPNG())
    }
  }
  try {
    await shoot('01-start')
    await js(`__katy.actions.selectSong('song-amazing-grace'); __katy.actions.addToService('song-amazing-grace')`)
    await wait(600)
    await js(`__katy.actions.goLive({ kind: 'song', songId: 'song-amazing-grace' }, 0)`)
    await wait(900)
    await shoot('02-live')
    await js(`__katy.actions.setSongTheme(__katy.useStore.getState().songs[0], 'theme-sunrise'); __katy.actions.step(1)`)
    await wait(900)
    await shoot('03-next-sunrise')
    await js(`__katy.actions.editTheme(__katy.useStore.getState().themes.find(t => t.id === 'theme-deep-blue'))`)
    await wait(700)
    await shoot('04-theme-editor')
    await js(`__katy.actions.editTheme(null); __katy.actions.editSong(__katy.useStore.getState().songs[0])`)
    await wait(700)
    await shoot('05-song-editor')
    // Bible tab: look up John 3:16-18 in KJV through the UI, add it to the service, go live, step once
    await js(`__katy.useStore.setState({ editingSong: null });
      [...document.querySelectorAll('.tabs button')].find((b) => b.textContent === 'Bible').click()`)
    await wait(300)
    await js(`(() => {
      const fire = (el, proto, value, type) => {
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
        el.dispatchEvent(new Event(type, { bubbles: true }))
      }
      fire(document.querySelector('.ref-row select'), HTMLSelectElement.prototype, 'kjv', 'change')
      fire(document.querySelector('.ref-input'), HTMLInputElement.prototype, 'John 3:16-18', 'input')
      fire(document.querySelector('.bible-panel input[type=search]'), HTMLInputElement.prototype, 'loved the world', 'input')
    })()`)
    await wait(700)
    await js(`(() => {
      document.querySelector('.ref-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      const button = (text) => [...document.querySelectorAll('.ref-actions button')].find((b) => b.textContent === text)
      button('Add to service').click()
      button('Go live').click()
    })()`)
    await wait(600)
    await js(`__katy.actions.step(1)`)
    await wait(900)
    await shoot('06-scripture')
    await smokeBibleImport(js, shoot, wait)
    const errors = await js(`window.__katyErrors || []`)
    await fs.writeFile(path.join(dir, 'errors.json'), JSON.stringify(errors, null, 2))
  } catch (e) {
    await fs.writeFile(path.join(dir, 'errors.json'), JSON.stringify([String(e)]))
  }
  app.quit()
}

/** Settings → Bibles → import the Zefania fixture (file dialog stubbed), rename, use, delete. */
async function smokeBibleImport(
  js: (code: string) => Promise<unknown>,
  shoot: (name: string) => Promise<void>,
  wait: (ms: number) => Promise<void>
): Promise<void> {
  const fixture = path.join(app.getAppPath(), 'src/main/bible/fixtures/zefania.xml')
  dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [fixture] })) as unknown as typeof dialog.showOpenDialog
  const click = (sel: string, text: string): string =>
    `[...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`
  const typeInto = (sel: string, value: string): string => `(() => {
    const el = document.querySelector(${JSON.stringify(sel)})
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()`
  await js(`window.confirm = () => true; __katy.actions.openSettings(true)`)
  await wait(500)
  await js(click('.modal button', 'Import Bible'))
  await wait(1500)
  await shoot('07-import')
  await js(typeInto('.modal .modal label:nth-of-type(2) input', 'FIX'))
  await js(click('.modal footer button', 'Add Bible'))
  await wait(1000)
  await js(`__katy.actions.openSettings(false)`)
  await wait(300)
  await js(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent === 'Bible').click()`)
  await wait(300)
  await js(`(() => {
    const fire = (el, proto, value, type) => {
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      el.dispatchEvent(new Event(type, { bubbles: true }))
    }
    const b = __katy.useStore.getState().bibles.find((x) => x.abbrev === 'FIX')
    if (!b) throw new Error('imported Bible missing')
    fire(document.querySelector('.ref-row select'), HTMLSelectElement.prototype, b.id, 'change')
    fire(document.querySelector('.ref-input'), HTMLInputElement.prototype, 'John 3:16', 'input')
  })()`)
  await wait(700)
  await js(`[...document.querySelectorAll('.ref-actions button')].find((b) => b.textContent === 'Add to service').click()`)
  await wait(500)
  await js(`__katy.actions.openSettings(true)`)
  await wait(400)
  await js(click('.bible-table button', '🗑'))
  await wait(800)
  await js(`__katy.actions.openSettings(false)`)
  await wait(500)
  await shoot('08-missing-bible')
}
