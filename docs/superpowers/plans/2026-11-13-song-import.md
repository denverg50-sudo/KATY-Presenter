# Song Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the church's ~500 FreeShow songs in one batch, plus OpenLyrics, OpenSong, ChordPro, CCLI SongSelect and plain-text songs, through a preview window that accounts for every file.

**Architecture:** Each parser turns one file into an `ImportedSong` made of raw sections plus a play order. A shared pure function (`assembleSong`) turns those into Katy's `lyrics` and `arrangement`, and a round trip through `buildSlides` must reproduce the source order. Parsing runs in a Node worker, following the Bible import pattern. A main-process `SongImporter` holds the preview under a token and commits all-or-nothing through `Storage`. The renderer shows a summary with category tick boxes.

**Tech Stack:** Electron 45, React 19, TypeScript, Zustand, Vitest, `saxes` (already installed), electron-vite `?nodeWorker`.

**Spec:** `docs/superpowers/specs/2026-11-13-song-import-design.md`

## Global Constraints

- The UI reaches Electron only through `window.api` (`Api` in `src/shared/types.ts`).
- No native Node modules. No new npm dependencies are needed.
- Offline. Songs are saved via `Storage.save('songs', song)`, so they land in `library/songs/<id>.json` and in backups.
- Existing song files keep loading. `Song.source?: string` is optional.
- An imported `arrangement` must rebuild **exactly** the source slide order through `buildSlides(lyrics, arrangement)` (`src/shared/lyrics.ts`).
- Every file is accounted for: imported, duplicate, ignored (not a song file), or failed (with a reason). Notes never block.
- All-or-nothing commit. Cancel frees the batch. Nothing is saved before **Import**.
- Same-title songs (normalised: case, punctuation and whitespace ignored) are skipped, whether they match the library or an earlier ticked song in the batch.
- No copyrighted lyrics in the repo. Fixtures are invented, or "Amazing Grace" (public domain).
- npm on this machine needs `NODE_EXTRA_CA_CERTS=<keychain pem>`. The sandbox blocks the registry. No installs are expected.

## Review Focus

1. A FreeShow song whose chorus repeats in the layout and has two groups both named "Verse": the output must be `[Verse 1] … [Chorus] … [Verse 2]` with arrangement `V1 C V2 C`, and the round trip must match. Tested in Tasks 1 and 2.
2. Windows line endings, a UTF-8 BOM, and curly quotes in `.txt`/`.usr`/`.cho` files: the lyrics must come out clean, with no `\r` and no BOM in the title. Tested in Task 4.
3. A folder containing junk (`.DS_Store`, a README.txt with one line, a FreeShow `settings.json`, a binary `.pro`): each is ignored and listed, and none crashes the batch. Tested in Task 5.
4. Two files with the same song title, one in an unticked category: the ticked one is imported, and the counts update when ticks change. Tested in Tasks 6 and 7.
5. A write fails halfway through a commit: no new songs remain afterwards. Tested in Task 6.

---

### Task 1: Song assembly model (pure)

**Files:**
- Create: `src/shared/songImport.ts`
- Test: `src/shared/songImport.test.ts`

**Interfaces:**
- Produces:
  - `interface RawSection { name: string | null; slides: string[] }`. `name: null` means the section is ungrouped.
  - `interface ImportedSong { title: string; author: string; ccli: string; copyright: string; lyrics: string; arrangement: string; source: string; category: string | null; notes: string[]; file: string }`
  - `assembleSong(sections: RawSection[], order: number[]): { lyrics: string; arrangement: string; notes: string[] }`. Here `order` holds indexes into `sections` in play order, with repeats allowed. If `order` is empty, the written order is used.
  - `normalizeTitle(t: string): string`: lower-cases, strips everything except letters and digits (Unicode), and collapses whitespace.
  - `sectionNameFromCode(code: string): string`: maps OpenLyrics/OpenSong codes, e.g. `v1`→`Verse 1`, `c`→`Chorus`, `c2`→`Chorus 2`, `b`→`Bridge`, `p`→`Pre-Chorus`, `e`→`Ending`, `i`→`Intro`, `o`→`Other`, `t`→`Tag`. Unknown codes are returned upper-cased.

Rules for `assembleSong`, from the spec:
- Slides are trimmed. Empty slides are dropped and counted. Sections left with no slides are dropped. The note reads `"N blank slides left out"`.
- `null` names become `Slide 1`, `Slide 2` … in order of first appearance in `order`.
- When a name is used by more than one section, each gets a number in order of first appearance (`Verse` ×2 → `Verse 1`, `Verse 2`). A name used once is kept as written.
- After that, if two labels share `abbreviate()` (case-insensitive) or a label equals another's abbreviation, a number is appended to the later one until every label and abbreviation is unique.
- `lyrics` = `sectionsToLyrics`, in order of first appearance. `arrangement` = the abbreviation tokens joined by spaces. When `order` equals the written order with no repeats, `arrangement` is `''`.

- [ ] **Step 1: Write failing tests**:
  - Two `Verse` sections and a `Chorus`, with order `[0,1,2,1]`, give lyrics with `[Verse 1]`, `[Chorus]`, `[Verse 2]` and arrangement `V1 C V2 C`.
  - `Pre-Chorus` + `Post-Chorus` → the second becomes `Post-Chorus 2` and the tokens are unique.
  - A `null`-named section becomes `Slide 1`.
  - One blank slide gives the note `1 blank slide left out` (singular), and three give `3 blank slides left out`.
  - Written order with no repeats → `arrangement === ''`.
  - **Round-trip property:** for each case, `buildSlides(lyrics, arrangement).map(s => s.text)` equals the non-blank source slides expanded by `order`.
  - `normalizeTitle('  Amazing   Grace! ')` equals `normalizeTitle('amazing grace')`.
  - `sectionNameFromCode('v1') === 'Verse 1'`, `sectionNameFromCode('c') === 'Chorus'`.
- [ ] **Step 2:** Run `npx vitest run src/shared/songImport.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Reuse `abbreviate` and `sectionsToLyrics` from `lyrics.ts`, and don't change `lyrics.ts`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit `feat(songs): song assembly model`.

### Task 2: FreeShow parser

**Files:**
- Create: `src/main/songs/parse-freeshow.ts`, `src/main/songs/fixtures/freeshow/*.show` (invented text or Amazing Grace)
- Test: `src/main/songs/parse-freeshow.test.ts`

**Interfaces:**
- Consumes: `RawSection`, `ImportedSong`, `assembleSong` (Task 1).
- Produces:
  - `parseFreeShow(json: string, file: string): ImportedSong` (throws `Error` with a short reason).
  - `looksLikeFreeShow(value: unknown): boolean`: true for an object with `slides` and `layouts` objects, or an `[string, thatObject]` pair.

Mapping (from the spec):
- title = `meta.title || name`.
- author = `meta.author || meta.artist`.
- ccli = `meta.CCLI ?? meta.ccli`.
- copyright = `meta.copyright`.
- category = `category ?? null`.
- source = `'FreeShow'`.
- Layout = `settings.activeLayout`, else the first layout key. Each `layout.slides[]` entry `{ id, disabled? }`, with disabled entries skipped, becomes one occurrence of that slide's section. A grouped slide is one section: its own text, then the text of each slide id in its `children`, in order. A `group: null` slide listed directly in the layout becomes a `null`-named section. A missing slide id is dropped with the note `Layout points to a missing slide`.
- Slide text: for each item, for each line, the `text[].value` parts are joined. Lines are joined with `\n` and items with `\n`. `<br>`/`<br/>` become `\n`, other tags are stripped, and `&amp; &lt; &gt; &quot; &#39; &nbsp;` are decoded.
- With no text at all, throw `No lyrics found in this FreeShow show`.

- [ ] **Step 1: Write fixtures and failing tests:**
  - `repeat-chorus.show`: two "Verse" groups, a Chorus with one child slide, and layout V C V C.
  - `pair.show`: the `[id, show]` form.
  - `multi-item.show`: two text items on one slide.
  - `ungrouped.show`: a null-group slide in the layout.
  - `missing-slide.show`: the layout references an unknown id.
  - `empty.show`: no text.
  - `announcement.show`: category `"info"`.
  - `meta-lower.show`: `meta.ccli`.
  - Tests assert:
    - the exact lyrics and arrangement for `repeat-chorus` (arrangement `V1 C V2 C`);
    - the round trip as in Task 1;
    - category values;
    - the notes text;
    - the error message for `empty`;
    - `looksLikeFreeShow` is true for both forms and false for `{}`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement tolerantly. Any unexpected shape becomes a note, never a TypeError.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(songs): FreeShow importer`.

### Task 3: OpenLyrics and OpenSong parsers

**Files:**
- Create: `src/main/songs/parse-openlyrics.ts`, `src/main/songs/parse-opensong.ts`, `src/main/songs/fixtures/{openlyrics.xml,opensong.xml}`
- Test: `src/main/songs/parse-xml-songs.test.ts`

**Interfaces:**
- Consumes: Task 1. `decodeXml(buf)` from `src/main/bible/parse-xml.ts`, for the encoding and BOM.
- Produces:
  - `parseOpenLyrics(xml: string, file: string): ImportedSong`, with source `'OpenLyrics'`.
  - `parseOpenSong(xml: string, file: string): ImportedSong`, with source `'OpenSong'`.

Mapping (from the spec):
- **OpenLyrics:**
  - title = first `properties/titles/title`; author = `authors/author` joined with `, `; `ccliNo`; `copyright`.
  - Each `lyrics/verse[@name]` → one section named `sectionNameFromCode(name)`, and each `<lines>` element is one slide. `<br/>` becomes a newline and `<chord>`/`<comment>` are dropped.
  - `verseOrder` (space-separated names) → `order`. Unknown names are skipped with a note.
- **OpenSong:**
  - `title`, `author`, `copyright`, `ccli`.
  - `lyrics` text: a line `[V1]` starts a section (`sectionNameFromCode`); lines starting with `.` (chords) and `;` (comments) are dropped. `||` or `|` on a line ends a slide, and a leading space or digit column prefix ` 1`/`1` (multi-verse layout) is handled as OpenSong does: digit-prefixed lines in a `[V]` block become V1/V2.
  - `presentation` (space-separated codes) → `order`.

- [ ] **Step 1: Write fixtures** (Amazing Grace verses) and failing tests:
  - exact lyrics and arrangement per format;
  - the round trip;
  - chords stripped;
  - an unknown verseOrder name produces a note.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement with `saxes`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(songs): OpenLyrics and OpenSong importers`.

### Task 4: ChordPro, SongSelect and plain-text parsers, plus format detection

**Files:**
- Create: `src/main/songs/parse-text-songs.ts`, `src/main/songs/detect-song.ts`, `src/main/songs/fixtures/{song.cho,song.usr,songselect.txt,plain.txt}`
- Test: `src/main/songs/parse-text-songs.test.ts`

**Interfaces:**
- Produces:
  - `parseChordPro(text, file): ImportedSong` (source `'ChordPro'`)
  - `parseSongSelectUsr(text, file): ImportedSong` (source `'SongSelect'`)
  - `parsePlainText(text, file): ImportedSong` (source `'SongSelect'` when a CCLI footer is found, else `'Text'`)
  - `type SongFormat = 'freeshow' | 'openlyrics' | 'opensong' | 'chordpro' | 'usr' | 'text'`
  - `detectSongFormat(buf: Buffer, fileName: string): SongFormat | null`. Detection order:
    1. JSON that `looksLikeFreeShow` → `freeshow`.
    2. XML root `song` with an OpenLyrics namespace or `<lyrics><verse` → `openlyrics`.
    3. XML root `song` with a `<lyrics>` text child → `opensong`.
    4. Text containing `{title` / `{t:` / `{start_of_` / `{sov` → `chordpro`.
    5. `[File]` + `Words=` → `usr`.
    6. A `.txt` file with at least 2 non-empty lines after the title → `text`.
    7. Otherwise `null`.

    Binary content (a NUL byte in the first 1 KB) is `null`.
  - `decodeText(buf: Buffer): string`: strips a UTF-8 BOM, decodes UTF-16 LE/BE when there is a BOM, and normalises `\r\n` and `\r` to `\n`.

Mapping (from the spec):
- **ChordPro:**
  - `{title|t:}`, `{artist|subtitle|st:}`, `{ccli:}`, `{copyright:}`.
  - `{start_of_verse|sov[: label]}` … `{end_of_verse|eov}` blocks, and the same for chorus (`soc`/`eoc`) and bridge (`sob`/`eob`), with labels defaulting to Verse/Chorus/Bridge. A `{comment|c: X}` line is a section label when X is a known label.
  - `[Chord]` tokens are stripped and other directives are ignored. Blank lines split slides.
- **USR:**
  - `Title=`, `Author=` (`|` → `, `), `Copyright=` (`|` → `, `), `[S A<digits>]` → ccli.
  - `Fields=` and `Words=` are split on `/t`. Each field name is a section label, and its words with `/n` become newlines. A blank line within the words splits slides.
- **Plain / SongSelect `.txt`:** follow the spec's rules (first line is the title; known labels start sections; the CCLI footer fills ccli and copyright and is dropped from the lyrics; blank lines split slides). When there are no labels, the whole text is one unlabelled section, which becomes `Slide 1`. This is the spec's "known labels" list.

- [ ] **Step 1: Write fixtures** (invented or Amazing Grace, including one with `\r\n` + BOM + curly quotes) and failing tests:
  - fields and lyrics per format;
  - chords stripped;
  - the CCLI footer not in the lyrics;
  - BOM and `\r` absent;
  - `detectSongFormat` per fixture, plus `null` for `.DS_Store` bytes, a one-line README.txt, a JSON `{"theme":"dark"}`, and binary bytes named `.pro`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(songs): ChordPro, SongSelect and text importers`.

### Task 5: File scanning, dispatch and the worker

**Files:**
- Create: `src/main/songs/scan.ts`, `src/main/songs/import-worker.ts`, `src/main/songs/run-import.ts`
- Test: `src/main/songs/scan.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `SONG_EXTENSIONS = ['.show', '.json', '.xml', '.cho', '.chopro', '.chordpro', '.pro', '.usr', '.txt']`
  - `collectFiles(paths: string[], cap = 5000): Promise<{ files: string[]; truncated: boolean }>`: expands folders recursively, keeps only `SONG_EXTENSIONS`, skips dot-files and dot-folders, de-duplicates, and sorts.
  - `interface ParseResult { songs: ImportedSong[]; ignored: string[] /*file names*/; failed: { file: string; reason: string }[]; fileCount: number; truncated: boolean }`
  - `parseSongFiles(paths: string[]): Promise<ParseResult>`: reads each file, detects the format, and parses it. A `null` format goes to `ignored`, and a parser throw goes to `failed` (first line of the message, ≤160 characters). It never throws for a per-file problem.
  - `runSongImport(paths: string[]): Promise<ParseResult>` in `run-import.ts`, using `import createWorker from './import-worker?nodeWorker'`, the same pattern as `src/main/bible/run-import.ts`, and loaded only via dynamic `import()` when `!process.env.VITEST`.
- [ ] **Step 1: Write failing tests** against a temp folder holding:
  - fixtures from Tasks 2–4;
  - `.DS_Store`;
  - `README.txt` (one line);
  - `settings.json` (`{"theme":"dark"}`);
  - `binary.pro` (bytes with NULs);
  - a broken `bad.show` (`{"slides":{},"layouts":` truncated);
  - a nested sub-folder with one more song.

  Assert that `songs.length`, `ignored`, `failed[0].file === 'bad.show'`, `fileCount` and the nested song are all found. Also assert that `collectFiles(..., 3)` sets `truncated`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. A truncated JSON whose name ends in `.show` counts as failed, not ignored, with the reason `Not valid FreeShow JSON`.
- [ ] **Step 4:** Run. Expected: PASS. Confirm that `npx electron-vite build` emits the song worker chunk.
- [ ] **Step 5:** Commit `feat(songs): scan folders and parse in a worker`.

### Task 6: SongImporter, the `Song.source` field and IPC

**Files:**
- Create: `src/main/songs/importer.ts`
- Modify: `src/shared/types.ts` (`Song.source?`, `SongImportPreview`, `Api`), `src/main/index.ts`, `src/preload/index.ts`, `src/main/storage.ts` (only if a helper is needed)
- Test: `src/main/songs/importer.test.ts`

**Interfaces:**
- Produces (types in `src/shared/types.ts`):
  - `interface SongImportItem { key: string; title: string; file: string; source: string; category: string | null; libraryDuplicate: boolean; notes: string[] }`
  - `interface SongImportPreview { token: string; fileCount: number; truncated: boolean; items: SongImportItem[]; ignored: string[]; failed: { file: string; reason: string }[] }`
  - `Api` additions:
    - `songImportPick(mode: 'folder' | 'files'): Promise<SongImportPreview | null>`
    - `songImportCommit(token: string, keys: string[]): Promise<{ imported: number; skipped: number }>`
    - `songImportCancel(token: string): Promise<void>`
  - Pure helper in `src/shared/songImport.ts`: `selectForImport(items: SongImportItem[], tickedCategories: Set<string | null>): { importKeys: string[]; duplicates: SongImportItem[] }`.
    - It keeps items whose `category` is ticked. Items from non-FreeShow sources (category `null` and source ≠ FreeShow) are always kept.
    - It drops `libraryDuplicate` items and later items whose `normalizeTitle` repeats an earlier kept one. Those go into `duplicates`.
  - `class SongImporter { constructor(storage: Storage, parse: (paths) => Promise<ParseResult>); prepare(paths): Promise<SongImportPreview>; commit(token, keys): Promise<{imported; skipped}>; cancel(token): void }`. It keeps one pending batch, like `BibleStore`.
- Behaviour:
  - `commit` re-checks each key's title against the library at commit time; matches are skipped and counted.
  - It writes songs with `crypto.randomUUID()` ids, `themeId: ''`, `updatedAt: Date.now()` and `source`.
  - If any write fails, it removes the songs already written in this commit and rethrows `Import failed — nothing was added: <reason>`.
  - An unknown or expired token throws `This import has expired or was cancelled. Please choose the files again.`
- IPC:
  - `song:import-pick`: `mode` `'folder'` → `properties: ['openDirectory']`; `'files'` → `['openFile','multiSelections']` with the filter "Song files" `SONG_EXTENSIONS` plus All files. On cancel it returns `null`.
  - `song:import-commit` and `song:import-cancel`.
  - The two pick modes exist because Windows can't select files and folders in one dialog. This is a ruling against the spec's "files and folder".
- [ ] **Step 1: Write failing tests** with a temp `Storage` and a fake `parse`:
  - the preview marks `libraryDuplicate`;
  - `selectForImport` with an unticked category containing a same-title song keeps the ticked one (Review Focus 4);
  - commit writes songs that `storage.list('songs')` returns, with `source`;
  - a write that throws on the 3rd song leaves the library unchanged (Review Focus 5; stub `storage.save`);
  - cancel and a reused token reject with the exact message.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement, wire IPC and the preload, then run `npm run typecheck`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(songs): import preview, commit and IPC`.

### Task 7: Import window, Settings → Songs, and the editor note

**Files:**
- Create: `src/renderer/src/control/ImportSongsDialog.tsx`
- Modify: `SettingsDialog.tsx` (new "Songs" section with **Import songs from a folder…** and **Import song files…**), `SongEditor.tsx` (small muted note `Imported from {source}` when set), `store.ts` (an action to reload songs after an import), `styles.css`, `src/main/smoke.ts`

**Behaviour (from the spec's sketch):**
- While picking and parsing, "Reading files…" is shown with a spinner.
- The summary reads, in order:
  - `Read {fileCount} files` (plus "— stopped at 5,000 files" if truncated)
  - `✔ {n} songs ready to import`
  - `↷ {n} already in your library or repeated` (expandable list: title — file)
  - `⚠ {n} imported with notes` (expandable list: title: notes)
  - `✖ {n} couldn't be read` (expandable: file — reason)
  - `{n} other files ignored` (expandable list)
- **FreeShow categories** row: shown only if any FreeShow items exist. There is one checkbox per distinct category value, labelled with the raw value or "(none)", with counts. The default ticks follow the spec call 6 (contains "song" or "lyric", or none).
- Counts are recomputed with `selectForImport` on every tick change.
- Buttons are **Cancel** and **Import {n} songs** (disabled at 0 or while busy).
- During commit, "Importing…" shows and every control is disabled. On success the window shows `{imported} songs added` and a **Done** button.
- Cancel and close call `songImportCancel`. Errors are shown inline with the IPC prefix stripped (reuse the existing `ipcMessage` helper).
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Extend the smoke (`KATY_SMOKE` only): stub `dialog.showOpenDialog` to return `src/main/songs/fixtures` (folder mode), open Settings → Songs → folder import, untick the `info` category, save the screenshot `09-song-import-control.png`, click Import, and assert the library grew.
- [ ] **Step 3:** Run `npm test`, `npm run typecheck`, and the smoke. Check the screenshot. `errors.json` must be `[]`.
- [ ] **Step 4:** Commit `feat(songs): import songs window`.

### Task 8: Docs and version

**Files:** `INSTALL.md` (a "Moving your songs from FreeShow" section: where FreeShow keeps its Shows folder on Windows (`Documents\FreeShow\Shows`) and Mac (`~/Documents/FreeShow/Shows`), the steps, reading the summary, spot-checking songs with a repeated chorus, keeping the FreeShow folder until satisfied; and other supported formats), `README.md` (roadmap), `package.json` version `0.3.0`.

- [ ] **Step 1:** Write the docs. Run `npm test` and `npm run typecheck`.
- [ ] **Step 2:** Commit `docs: song import; v0.3.0`.
