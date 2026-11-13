import { app } from 'electron'
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
    await js(`__katy.actions.goLive('song-amazing-grace', 0)`)
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
    const errors = await js(`window.__katyErrors || []`)
    await fs.writeFile(path.join(dir, 'errors.json'), JSON.stringify(errors, null, 2))
  } catch (e) {
    await fs.writeFile(path.join(dir, 'errors.json'), JSON.stringify([String(e)]))
  }
  app.quit()
}
