import { parentPort, workerData } from 'worker_threads'
import { parseSongFiles } from './scan'

parseSongFiles((workerData as { paths: string[] }).paths).then(
  (ok) => parentPort?.postMessage({ ok }),
  (e) => parentPort?.postMessage({ error: e instanceof Error ? e.message : String(e) })
)
