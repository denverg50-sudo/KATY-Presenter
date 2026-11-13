import type { BibleBook } from '@shared/types'

/** Turn sparse book -> chapters -> verses maps into dense BibleBooks (gaps become '' / []). */
export function buildBooks(books: Map<number, string[][]>): BibleBook[] {
  const out: BibleBook[] = []
  for (const [n, chs] of [...books.entries()].sort((x, y) => x[0] - y[0])) {
    const chapters: string[][] = []
    for (let i = 0; i < chs.length; i++) {
      const ch = chs[i]
      if (!ch) {
        chapters.push([])
        continue
      }
      const verses: string[] = []
      for (let j = 0; j < ch.length; j++) verses.push(ch[j] ?? '')
      chapters.push(verses)
    }
    out.push({ num: n, chapters })
  }
  return out
}
