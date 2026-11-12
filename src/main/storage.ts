import { promises as fs } from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import type { Kind, Settings } from '../shared/types'
import { defaultSettings, sampleSongs, starterThemes } from '../shared/defaults'

const KINDS: Kind[] = ['songs', 'themes', 'services']
const SAFE_ID = /^[A-Za-z0-9_-]+$/

/** Stores the library as plain JSON files so users can back up or inspect it easily. */
export class Storage {
  constructor(readonly root: string) {}

  get mediaDir(): string {
    return path.join(this.root, 'media')
  }

  private dir(kind: Kind): string {
    if (!KINDS.includes(kind)) throw new Error(`Unknown kind: ${kind}`)
    return path.join(this.root, kind)
  }

  private file(kind: Kind, id: string): string {
    if (!SAFE_ID.test(id)) throw new Error(`Invalid id: ${id}`)
    return path.join(this.dir(kind), `${id}.json`)
  }

  /** Create folders and seed starter content on first launch. */
  async init(): Promise<void> {
    const firstRun = !(await exists(path.join(this.root, 'settings.json')))
    for (const k of KINDS) await fs.mkdir(this.dir(k), { recursive: true })
    await fs.mkdir(this.mediaDir, { recursive: true })
    if (firstRun) {
      for (const t of starterThemes()) await this.save('themes', t)
      for (const s of sampleSongs()) await this.save('songs', s)
      await this.saveSettings(defaultSettings())
    }
  }

  async list<T>(kind: Kind): Promise<T[]> {
    const files = (await fs.readdir(this.dir(kind))).filter((f) => f.endsWith('.json'))
    const items: T[] = []
    for (const f of files) {
      try {
        items.push(JSON.parse(await fs.readFile(path.join(this.dir(kind), f), 'utf8')))
      } catch {
        // skip unreadable / corrupt files rather than breaking the whole library
      }
    }
    return items
  }

  async save<T extends { id: string }>(kind: Kind, item: T): Promise<void> {
    await writeAtomic(this.file(kind, item.id), JSON.stringify(item, null, 2))
  }

  async remove(kind: Kind, id: string): Promise<void> {
    await fs.rm(this.file(kind, id), { force: true })
  }

  async getSettings(): Promise<Settings> {
    try {
      const raw = await fs.readFile(path.join(this.root, 'settings.json'), 'utf8')
      return { ...defaultSettings(), ...JSON.parse(raw) }
    } catch {
      return defaultSettings()
    }
  }

  async saveSettings(s: Settings): Promise<Settings> {
    const merged = { ...defaultSettings(), ...s }
    await writeAtomic(path.join(this.root, 'settings.json'), JSON.stringify(merged, null, 2))
    return merged
  }

  /** Copy files into the media library; returns the stored file names. */
  async importMedia(paths: string[]): Promise<string[]> {
    const names: string[] = []
    for (const p of paths) {
      const ext = path.extname(p).toLowerCase()
      const base = path.basename(p, path.extname(p)).replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'media'
      let name = `${base}${ext}`
      for (let i = 2; await exists(path.join(this.mediaDir, name)); i++) name = `${base} (${i})${ext}`
      await fs.copyFile(p, path.join(this.mediaDir, name))
      names.push(name)
    }
    return names
  }

  async listMedia(): Promise<string[]> {
    return (await fs.readdir(this.mediaDir)).filter((f) => !f.startsWith('.')).sort()
  }

  /** Resolve a media name to an absolute path, refusing anything outside the media folder. */
  mediaPath(name: string): string | null {
    const full = path.resolve(this.mediaDir, name)
    return full.startsWith(path.resolve(this.mediaDir) + path.sep) ? full : null
  }

  async exportZip(target: string): Promise<void> {
    const zip = new AdmZip()
    for (const k of [...KINDS, 'media']) zip.addLocalFolder(path.join(this.root, k), k)
    zip.addLocalFile(path.join(this.root, 'settings.json'))
    await zip.writeZipPromise(target)
  }

  /** Merge a backup into the library (items with the same id are replaced). */
  async importZip(source: string): Promise<void> {
    const zip = new AdmZip(source)
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const [top, ...rest] = entry.entryName.split('/')
      if (![...KINDS, 'media'].includes(top) || rest.length !== 1) continue
      const name = rest[0]
      if (name.startsWith('.') || name.includes('..')) continue
      if (top !== 'media' && !(name.endsWith('.json') && SAFE_ID.test(name.slice(0, -5)))) continue
      await fs.writeFile(path.join(this.root, top, name), entry.getData())
    }
  }
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false
  )
}

async function writeAtomic(file: string, data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, data, 'utf8')
  await fs.rename(tmp, file)
}
