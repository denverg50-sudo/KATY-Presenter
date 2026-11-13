import { parentPort, workerData } from 'worker_threads'
import { parseImportFiles } from './parse-files'

parseImportFiles((workerData as { paths: string[] }).paths).then(
  (ok) => parentPort?.postMessage({ ok }),
  (e) => parentPort?.postMessage({ error: e instanceof Error ? e.message : String(e) })
)
