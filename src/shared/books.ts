export interface Book {
  num: number
  name: string
  osis: string
  usfx: string
  aliases: string[]
}

// [name, osis, usfx, ...aliases]
const RAW: string[][] = [
  ['Genesis', 'Gen', 'GEN', 'ge', 'gn'],
  ['Exodus', 'Exod', 'EXO', 'ex', 'exod'],
  ['Leviticus', 'Lev', 'LEV', 'le', 'lv'],
  ['Numbers', 'Num', 'NUM', 'nu', 'nm', 'nb'],
  ['Deuteronomy', 'Deut', 'DEU', 'dt', 'de'],
  ['Joshua', 'Josh', 'JOS', 'jsh'],
  ['Judges', 'Judg', 'JDG', 'jg', 'jdgs'],
  ['Ruth', 'Ruth', 'RUT', 'rth', 'ru'],
  ['1 Samuel', '1Sam', '1SA', '1sm', 'first samuel'],
  ['2 Samuel', '2Sam', '2SA', '2sm', 'second samuel'],
  ['1 Kings', '1Kgs', '1KI', '1kg', 'first kings'],
  ['2 Kings', '2Kgs', '2KI', '2kg', 'second kings'],
  ['1 Chronicles', '1Chr', '1CH', 'first chronicles'],
  ['2 Chronicles', '2Chr', '2CH', 'second chronicles'],
  ['Ezra', 'Ezra', 'EZR', 'ezr'],
  ['Nehemiah', 'Neh', 'NEH', 'ne'],
  ['Esther', 'Esth', 'EST', 'es'],
  ['Job', 'Job', 'JOB', 'jb'],
  ['Psalms', 'Ps', 'PSA', 'psalm', 'pslm', 'psm', 'pss'],
  ['Proverbs', 'Prov', 'PRO', 'pr', 'prv'],
  ['Ecclesiastes', 'Eccl', 'ECC', 'ec', 'qoheleth'],
  ['Song of Solomon', 'Song', 'SNG', 'song of songs', 'songs', 'canticles', 'canticle of canticles', 'sos', 'ss'],
  ['Isaiah', 'Isa', 'ISA', 'is'],
  ['Jeremiah', 'Jer', 'JER', 'je', 'jr'],
  ['Lamentations', 'Lam', 'LAM', 'la'],
  ['Ezekiel', 'Ezek', 'EZK', 'eze', 'ezk'],
  ['Daniel', 'Dan', 'DAN', 'da', 'dn'],
  ['Hosea', 'Hos', 'HOS', 'ho'],
  ['Joel', 'Joel', 'JOL', 'jl'],
  ['Amos', 'Amos', 'AMO', 'am'],
  ['Obadiah', 'Obad', 'OBA', 'ob'],
  ['Jonah', 'Jonah', 'JON', 'jnh'],
  ['Micah', 'Mic', 'MIC', 'mc'],
  ['Nahum', 'Nah', 'NAM', 'na'],
  ['Habakkuk', 'Hab', 'HAB', 'hb'],
  ['Zephaniah', 'Zeph', 'ZEP', 'zp'],
  ['Haggai', 'Hag', 'HAG', 'hg'],
  ['Zechariah', 'Zech', 'ZEC', 'zc'],
  ['Malachi', 'Mal', 'MAL', 'ml'],
  ['Matthew', 'Matt', 'MAT', 'mt'],
  ['Mark', 'Mark', 'MRK', 'mk', 'mr'],
  ['Luke', 'Luke', 'LUK', 'lk', 'lu'],
  ['John', 'John', 'JHN', 'jn', 'jhn'],
  ['Acts', 'Acts', 'ACT', 'ac', 'acts of the apostles'],
  ['Romans', 'Rom', 'ROM', 'ro', 'rm'],
  ['1 Corinthians', '1Cor', '1CO', 'first corinthians'],
  ['2 Corinthians', '2Cor', '2CO', 'second corinthians'],
  ['Galatians', 'Gal', 'GAL', 'ga'],
  ['Ephesians', 'Eph', 'EPH', 'ep'],
  ['Philippians', 'Phil', 'PHP', 'pp'],
  ['Colossians', 'Col', 'COL', 'co'],
  ['1 Thessalonians', '1Thess', '1TH', 'first thessalonians'],
  ['2 Thessalonians', '2Thess', '2TH', 'second thessalonians'],
  ['1 Timothy', '1Tim', '1TI', 'first timothy'],
  ['2 Timothy', '2Tim', '2TI', 'second timothy'],
  ['Titus', 'Titus', 'TIT', 'ti'],
  ['Philemon', 'Phlm', 'PHM', 'phm', 'pm'],
  ['Hebrews', 'Heb', 'HEB'],
  ['James', 'Jas', 'JAS', 'jm'],
  ['1 Peter', '1Pet', '1PE', '1pt', 'first peter'],
  ['2 Peter', '2Pet', '2PE', '2pt', 'second peter'],
  ['1 John', '1John', '1JN', '1jhn', 'first john'],
  ['2 John', '2John', '2JN', '2jhn', 'second john'],
  ['3 John', '3John', '3JN', '3jhn', 'third john'],
  ['Jude', 'Jude', 'JUD', 'jd'],
  ['Revelation', 'Rev', 'REV', 'revelation of john', 'revelations', 'apocalypse', 're']
]

export const BOOKS: Book[] = RAW.map(([name, osis, usfx, ...aliases], i) => ({
  num: i + 1,
  name,
  osis,
  usfx,
  aliases
}))

const norm = (s: string): string => s.toLowerCase().replace(/[.\s]+/g, '')

// normalised key -> set of book numbers
const KEYS = new Map<string, Set<number>>()
for (const b of BOOKS) {
  for (const k of [b.name, b.osis, b.usfx, ...b.aliases]) {
    const key = norm(k)
    if (!KEYS.has(key)) KEYS.set(key, new Set())
    KEYS.get(key)!.add(b.num)
  }
}

function lookup(key: string): number | null {
  const exact = KEYS.get(key)
  if (exact) return exact.size === 1 ? [...exact][0] : null
  if ((key.match(/[a-z]/g) ?? []).length < 2) return null
  const hits = new Set<number>()
  for (const [k, nums] of KEYS) if (k.startsWith(key)) nums.forEach((n) => hits.add(n))
  return hits.size === 1 ? [...hits][0] : null
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3' }

export function findBook(name: string): number | null {
  const key = norm(name)
  if (!key) return null
  const direct = lookup(key)
  if (direct !== null) return direct
  const m = key.match(/^(iii|ii|i)([a-z].*)$/)
  return m ? lookup(ROMAN[m[1]] + m[2]) : null
}

export function bookName(num: number): string {
  return BOOKS[num - 1]?.name ?? ''
}
