import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import { parseOpenLpCsv, parseOpenLpSqlite } from './parse-openlp'

const req = createRequire(import.meta.url)

describe('parseOpenLpCsv', () => {
  const books = 'id,testament_id,name,abbreviation\n1,1,Genesis,Gen\n43,2,"John",Jn\n99,2,Tobit,Tob\n'
  const verses =
    'book_id,chapter,verse,text\n' +
    '1,1,1,"In the beginning, said the tale, ""it began"""\n' +
    '43,3,16,"<b>Loved</b> {x}the  world"\n' +
    '43,3,18,Later verse\n' +
    '99,1,1,Skipped\n'
  it('parses quoted fields, strips markup, reports skipped', () => {
    const r = parseOpenLpCsv(books, verses, 'my-bible.csv')
    expect(r.source).toBe('OpenLP CSV')
    expect(r.books.map((b) => b.num)).toEqual([1, 43])
    expect(r.books[0].chapters[0][0]).toBe('In the beginning, said the tale, "it began"')
    expect(r.books[1].chapters[2][15]).toBe('Loved the world')
    expect(r.books[1].chapters[2][16]).toBe('')
    expect(r.books[1].chapters[0]).toEqual([])
    expect(r.skipped).toEqual(['Tobit'])
  })
})

describe('parseOpenLpSqlite', () => {
  it('reads book/verse/metadata', async () => {
    const SQL = await initSqlJs({ locateFile: () => req.resolve('sql.js/dist/sql-wasm.wasm') })
    const db = new SQL.Database()
    db.run(`create table metadata(key varchar, value varchar);
      create table book(id integer, book_reference_id integer, testament_reference_id integer, name varchar);
      create table verse(id integer, book_id integer, chapter integer, verse integer, text text);
      insert into metadata values('name','Test Bible'),('Version','TB');
      insert into book values(1,43,2,'Whatever'),(2,null,1,'Unknown Scroll');
      insert into verse values(1,1,3,16,'A <i>made-up</i> line'),(2,2,1,1,'x');`)
    const buf = db.export()
    db.close()
    const r = await parseOpenLpSqlite(buf, 'x.sqlite')
    expect(r.name).toBe('Test Bible')
    expect(r.source).toBe('OpenLP database')
    expect(r.books[0].num).toBe(43)
    expect(r.books[0].chapters[2][15]).toBe('A made-up line')
    expect(r.skipped).toEqual(['Unknown Scroll'])
  })
})
