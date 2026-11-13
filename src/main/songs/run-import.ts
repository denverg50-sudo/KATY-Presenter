import createWorker from './import-worker?nodeWorker'
import type { ParseResult } from './scan'

/** Parse songs in a worker thread. Kept in its own module because `?nodeWorker` only resolves under electron-vite. */
export function runSongImport(paths: string[]): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const worker = createWorker({ workerData: { paths } })
    worker.once('message', (m: { ok?: ParseResult; error?: string }) => {
      if (m.ok) resolve(m.ok)
      else reject(new Error(m.error ?? 'Import failed'))
      void worker.terminate()
    })
    worker.once('error', (e: Error) => reject(new Error(`Import failed: ${e.message.split('\n')[0]}`)))
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error('Import failed unexpectedly'))
    })
  })
}
