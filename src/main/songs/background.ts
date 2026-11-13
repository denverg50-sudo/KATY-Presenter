import { parseSongFiles, type ParseResult } from './scan'

/** Parse in a worker thread; under Vitest `?nodeWorker` does not resolve, so run in-process. */
export async function parseSongsInBackground(paths: string[]): Promise<ParseResult> {
  if (process.env.VITEST) return parseSongFiles(paths)
  const { runSongImport } = await import('./run-import')
  return runSongImport(paths)
}
