# Bible verses — design

Date: 2026-11-13 · App: Katy-Presenter (Electron + React + TypeScript, `/Users/denverg/Documents/Pro Presenter`)

## Intent

Katy-Presenter is a free presenter for the owner's own church (non-commercial, English only). It already does songs, themes, a service list and projector output. Churches read scripture every Sunday, so the operator must be able to type a reference, show verses on the projector with the church's themes, and put passages into the service order next to songs.

The church wants modern translations (NIV, NKJV, ESV, NLT, The Message). Those are copyrighted, so they can't ship inside the app. The owner will **supply Bible files themselves** and load them through an **Import Bible** button. The app ships only public-domain Bibles.

## Goals

1. **Built-in Bibles, offline:** KJV, ASV, WEB, BSB (public domain, from `github.com/seven1m/open-bibles`).
2. **Import Bible** from files the user supplies. Formats:
   - Zefania XML (`<XMLBIBLE><BIBLEBOOK bnumber><CHAPTER cnumber><VERS vnumber>`)
   - OpenSong XML (`<bible><b n="Genesis"><c n="1"><v n="1">`). Files may use the `.xmm` extension and ISO-8859-1 encoding.
   - OSIS XML (`<verse osisID="Gen.1.1">` milestone or container style)
   - USFX (`<book id="GEN"><c id="1"/><v id="1"/>…<ve/>`)
   - OpenLP Bible database (`.sqlite`: tables `book`, `verse`, `metadata`)
   - OpenLP CSV (two files: books + verses)
   - The format is detected from content, not file extension.
3. **Look up scripture fast:** type a reference and see the verses as slides. Accept common forms: `John 3:16`, `Jn 3:16-18`, `1 Cor 13:4-7`, `1co 13 4`, `Ps 23` (whole chapter), `John 3:16-4:2` (crosses chapters), `Rom 8:28, 31-39` (lists).
4. **Word search** in the selected translation (e.g. "love one another"), with clickable results.
5. **Verse slides:** one verse per slide by default, adjustable to 2 or 3 per slide. Verse numbers shown small before each verse (can be switched off). The reference and translation (e.g. "John 3:16 · NIV") appear on screen in a smaller line.
6. **Themes:** scripture uses a **Scripture theme** chosen in Settings (default: the default song theme). It can be changed per passage, like songs.
7. **Service list:** passages can be added to the service and reordered next to songs. Next/Back flows through them like songs, including moving on to the next service item.
8. **Manage Bibles** in Settings: list installed Bibles (name, abbreviation, verse count), rename the abbreviation, delete imported ones, and import new ones.

## Non-goals (this project)

- Online sources (API.Bible, ESV, NLT APIs). Possible later.
- Song import (next project).
- Showing two translations side by side, Strong's numbers, footnotes, cross-references, headings, red-letter text.
- Non-English book names.
- Apocrypha/deuterocanon. Books outside the 66 are skipped on import.

## Anti-goals (would count as failure)

- Any copyrighted Bible text in the repo, installer or CI artifacts. Test fixtures must be tiny public-domain or invented snippets.
- Lookup that stalls the operator mid-service. Typing a reference must update the preview within ~100 ms on a normal laptop. Importing can take a few seconds but must not freeze the window.
- An imported Bible silently missing books or verses. The import summary must show counts (books / chapters / verses) and list skipped books.

## Constraints

- Everything works offline. Data lives in the existing library folder (`<userData>/library/`) and is included in the existing backup/restore zip.
- The UI talks to Electron only via `window.api` (`src/shared/types.ts → Api`), so a web build stays possible later.
- Windows and macOS builds via the existing electron-builder + GitHub Actions setup. Avoid native Node modules: they complicate cross-platform builds. Use WebAssembly or pure JS instead.
- Existing service files (`items: [{ id, songId }]`) must keep loading.

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **A. Convert every Bible once into Katy-Presenter's own compact JSON, stored in the library** | Import takes a few seconds once. Lookups are instant and identical for every source format. Originals are untouched. | **Chosen** (agreed with the owner) |
| B. Read the original files on every lookup | Breaks when files move. Each lookup has to parse a 5 MB XML file, and every format path must be fast. | Rejected |
| C. Store Bibles in SQLite | Fast queries, but needs a native module (build pain) or loading sql.js for every lookup. JSON in memory is simpler at Bible size (~5 MB). | Rejected for storage. sql.js is used only to *read* OpenLP `.sqlite` imports. |

## Design (decided)

### Data

`library/bibles/<id>.json`:

```ts
interface Bible {
  id: string            // e.g. "kjv" for built-ins, uuid for imports
  name: string          // "New International Version"
  abbrev: string        // "NIV" (shown on screen), user-editable
  builtIn: boolean
  source: string        // detected format, e.g. "OpenSong XML"
  books: { num: number /* 1–66 canonical */; chapters: string[][] /* [chapter-1][verse-1] = text */ }[]
}
```

- Book names and abbreviations come from one shared English table of 66 books (names, common abbreviations, OSIS/USFX codes), not from the file. Book identity is resolved from `bnumber` (Zefania), OSIS/USFX codes, or name matching against the table (OpenSong, OpenLP CSV/DB).
- Built-ins ship as gzipped JSON in `resources/bibles/`. A dev script downloads the four public-domain sources from open-bibles and converts them with the same importer code. Built-ins can't be deleted.
- Bibles load into memory in the **main process** only when first used. The renderer asks for passages over IPC: `bible:list`, `bible:passage(bibleId, ref)`, `bible:search(bibleId, query)`, `bible:import()`, `bible:update`, `bible:delete`.

### Reference parsing (`src/shared/scripture.ts`, pure, unit-tested)

`parseReference(text) → { book: number; ranges: { from: {c,v}; to: {c,v} }[] } | error`.
- It's forgiving: case, dots and spacing don't matter, numbered books can be written `1 Cor` / `1Cor` / `I Corinthians`, and the shortest unambiguous prefix works (`Jn`, `Phil` → Philippians, `Phm` → Philemon).
- `formatReference` turns it back into the canonical form ("1 Corinthians 13:4–7").

### Slides

- `buildScriptureSlides(passage, versesPerSlide, showVerseNumbers)` produces the same `Slide` shape songs use (`key`, `label`, `text`), plus a `footer` string. The label is the verse span, e.g. "3:16".
- `LiveState` and `SlideRenderer` gain an optional **footer** line. It's drawn at the bottom inside the theme's padding at ~40% of the text size, in the theme's colour and font. The main text area shrinks to make room, so auto-fit still works.
- Verse numbers render as small superscript numbers. For that, `SlideRenderer` accepts text with a lightweight marker (e.g. `⁽16⁾`-style tokens rendered as `<sup>`), never raw HTML.

### State changes

- Live/selection generalise from "a song" to **a presentation item**: `{ kind: 'song', songId } | { kind: 'scripture', bibleId, ref, themeId }`.
- `ServiceItem` becomes `{ id, kind?: 'song' | 'scripture', songId?, bibleId?, ref?, themeId?, versesPerSlide? }`. A missing `kind` means song, which keeps old services working.
- The scripture slides for a service item are computed from the Bible when shown, not stored, so renaming the abbreviation updates them.

### UI

```
Left column (below Service):
┌ [ Songs | Bible ] ───────────┐
│ Bible tab:                   │
│ [NIV ▾]  [ jn 3:16-18     ]  │  ← reference box; Enter = show passage
│ John 3:16–18 · 3 verses      │  ← live parse feedback / error
│ [Add to service] [Go live]   │
│ ── or search words ──        │
│ [ love one another       🔍] │
│  John 13:34  …love one an…   │  ← click result = show that verse
└──────────────────────────────┘
Centre: verse slides grid (same as songs; header shows reference,
        translation picker, verses-per-slide 1/2/3, theme picker)
Settings → Bibles: installed list, Import Bible…, abbreviation edit,
        delete, Scripture theme picker, show verse numbers on/off
```

Import flow: choose file(s) → the format is detected → a dialog shows the detected name, an editable abbreviation, and counts (books / chapters / verses, skipped books) → **Add Bible**. OpenLP CSV needs both files: pick both in one go. If only one is picked, the error says which file is missing.

### Reliability

- Parsers run in the main process with a streaming or fast XML parser. The window stays responsive, and a progress/"Importing…" state is shown.
- Invalid or unknown files show a clear message ("This doesn't look like a Bible file. Supported: …"). Nothing partial is saved.
- Unit tests for each format use tiny invented fixtures (2 books, a few verses), for reference parsing, and for slide building. A smoke screenshot covers the Bible tab and a scripture slide on the output.

## Calls made after review (builder's calls, owner may override)

1. **Verses per slide is saved per passage.** `ServiceItem` and the scripture live item get `versesPerSlide` (1–3). New passages start from a global default in Settings (`defaultVersesPerSlide`, initially 1). "Show verse numbers" is one global setting only.
2. **Deleting a Bible never removes service items.** Scripture items whose Bible is missing stay in the service as a visible "Bible not installed: pick a translation" placeholder that can be re-pointed. The delete dialog warns how many service items use that Bible. Restored backups without the Bible behave the same way.
3. **Re-importing a translation with the same abbreviation offers "Replace existing"**, which keeps its id, so services keep working, or "Add as new".
4. **The footer shows the verses on that slide**, e.g. "John 3:17 · NIV", rather than the whole passage.
5. Clicking a word-search result **previews** the verse (selects it in the centre grid). It doesn't go live by itself.

## Left to the builder

- Choice of XML parser library (must handle ISO-8859-1, 5 MB files and both OSIS styles) and of the zip/gzip approach for built-ins.
- Exact abbreviation table contents, as long as the cases in Goal 3 work.
- Word-search algorithm (a linear scan of one Bible is fine). Cap results at ~200.
- Styling details within the existing dark UI.
