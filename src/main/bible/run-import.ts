import createWorker from './import-worker?nodeWorker'
import type { ParsedBible } from './parse-xml'

/** Parse in a worker thread. Kept in its own module because `?nodeWorker` only resolves under electron-vite. */
export function runImport(paths: string[]): Promise<ParsedBible> {
  return new Promise((resolve, reject) => {
    const worker = createWorker({ workerData: { paths } })
    worker.once('message', (m: { ok?: ParsedBible; error?: string }) => {
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
