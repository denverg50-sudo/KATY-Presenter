# Song import — design

Date: 2026-11-13 · App: Katy-Presenter (Electron + React + TypeScript, `/Users/denverg/Documents/Pro Presenter`), v0.2.0 shipped with Bibles.

## Intent

The church's ~500 songs live in **FreeShow**. The owner is moving off FreeShow **for good, in one go**: point Katy-Presenter at FreeShow's Shows folder once, bring every song across correctly, then retire FreeShow. Nobody should retype lyrics.

Because it happens once, the import summary is the operator's one chance to confirm that everything came across before FreeShow is retired. It must be complete and honest.

Other common formats come through the same window, for songs that arrive later from other churches or from CCLI.

## Goals

1. **FreeShow `.show` files**, the priority. Pick the whole Shows folder (or individual files) and import every song in one batch.
2. The same window also accepts **OpenLyrics XML** (OpenLP exports these), **OpenSong** song files, **ChordPro** (`.cho`, `.chopro`, `.chordpro`, `.pro`), **CCLI SongSelect** (`.usr` and the SongSelect `.txt` lyrics download) and **plain text** (`.txt`).
3. **Preview before saving:** a summary shows how many songs are ready, how many are skipped as already in the library, and which files couldn't be read and why. Nothing is saved until **Import** is clicked.
4. **FreeShow categories:** FreeShow keeps non-songs (announcements, sermon slides) in the same folder. The summary lists FreeShow's categories with counts and tick boxes, with songs ticked by default.
5. **Faithful mapping** into Katy's `Song`: title, author, CCLI number, copyright, sections (`[Verse 1]`, `[Chorus]` …) with their slide breaks, and the verse order (arrangement).
6. **Source tag:** each imported song records where it came from (e.g. "FreeShow"), visible in the song editor.

## Non-goals

- ProPresenter 6/7, EasyWorship, the OpenLP database and FreeShow `.project` files. They can be added later if someone brings a real sample file.
- Chords. ChordPro chords and FreeShow chords are dropped; only lyrics are kept.
- FreeShow's per-slide styling, fonts, positions, backgrounds, media, notes, timers and multiple languages. Songs use Katy themes. Where a FreeShow song has several text boxes on a slide, all text is kept, in reading order.
- Ongoing two-way sync with FreeShow, and updating songs that already exist.
- Exporting songs out of Katy-Presenter.

## Anti-goals (would count as failure)

- A song silently missing or silently cut short. Every file is accounted for in the summary as imported, skipped (with a reason) or unreadable (with a reason).
- A partial import after an error or a cancel. Either the whole batch is saved or nothing is.
- Freezing the window while 500 files are read.
- Duplicates created by an accidental second run. Same-title songs are skipped.

## Constraints

- The UI reaches Electron only through `window.api` (`src/shared/types.ts → Api`).
- No native Node modules. The Windows build comes from CI and the Mac build is local.
- Offline. Songs are stored the existing way: `library/songs/<id>.json` via `Storage`, and are included in backup.
- Existing song files keep loading. The new `Song` field is optional.
- Katy's lyrics model (`src/shared/lyrics.ts`): `[Tag]` lines start sections and blank lines split slides. `arrangement` is a space-separated list of section labels or their abbreviations (`abbreviate("Verse 1") = "V1"`), matched by `findSection`. An imported arrangement must rebuild **exactly** the source order through `buildSlides`.
- No copyrighted lyrics in the repo. Test fixtures use invented or public-domain text (e.g. "Amazing Grace").

## Approaches considered

| Approach | Trade-off | Decision |
|---|---|---|
| **A. A bulk import window inside the app**, reusing the Bible import setup (parse in a background worker in the main process, preview with a token, commit). | More UI work, but you see a full summary before anything is saved, and one button serves every format. | **Chosen** by the owner |
| B. A separate converter tool that produces a Katy backup zip, then Restore | Less to build, but it's an extra program, you can't see what was skipped until afterwards, and it's harder for volunteers. | Rejected |

## Design (decided)

### Where

**Settings → Songs → Import songs…**. The file dialog allows multiple files *and* a folder. A folder is read recursively for supported extensions (`.show`, `.json`, `.xml`, `.cho`, `.chopro`, `.chordpro`, `.pro`, `.usr`, `.txt`), with a hard cap of 5,000 files.

### Data

`Song` gains `source?: string` (e.g. `"FreeShow"`, `"OpenLyrics"`, `"ChordPro"`). The song editor shows "Imported from FreeShow" as a small note when it is set.

### Parsing (main process, worker thread)

Each parser turns one file into `ImportedSong { title, author, ccli, copyright, lyrics, arrangement, source, category?: string }`, or into an error with a short reason. Format is detected from content first and extension second.

**FreeShow `.show`** is JSON. It is either a show object or an `[id, show]` pair; accept both. Fields used:
- `name` or `meta.title` → title.
- `meta.author || meta.artist` → author. `meta.CCLI` → ccli. `meta.copyright` → copyright.
- `category` → category.
- `slides` is a map. A slide with a non-null `group` starts a section, and its `children` (slide ids) are further slides of that section, in order. Slide text comes from `items[].lines[].text[].value`: values within a line are joined, lines are joined with `\n`, items are separated by a newline, and empty items are skipped. FreeShow's `<br>`-style breaks inside values become newlines.
- **Section labels:** the `group` name, e.g. "Verse" or "Chorus". When several sections share a name, they are numbered in order of first appearance in the layout ("Verse 1", "Verse 2"). A single "Chorus" stays "Chorus". Labels are made unique so `findSection` resolves each arrangement token to the right section.
- **Arrangement:** from the active layout (`settings.activeLayout`, else the first layout). Its `slides[].id` are parent slides in play order, repeats allowed. Each becomes its section's token. Layout entries marked disabled are skipped. If a layout references a missing slide, that entry is dropped and noted as a warning on the song.
- A show with no text at all is reported as "no lyrics" and not imported.

**Other formats:**
- **OpenLyrics:** `<song><properties>` holds titles, authors, ccliNo and copyright. `<lyrics><verse name="v1">` contains `<lines>`, with `<br/>` as a line break. Each `<lines>` element is a slide. `<verseOrder>` gives the arrangement, and names map v1→Verse 1, c→Chorus, b→Bridge, p→Pre-Chorus, e→Ending, i→Intro, o→Other.
- **OpenSong:** `<song><title><author><copyright><ccli><lyrics>` with `[V1]` headers. `.` lines are chords and are dropped. `|` and `||` are slide breaks. `<presentation>` gives the order.
- **ChordPro:** `{title}`/`{t}`, `{artist}`/`{subtitle}`, `{ccli}`, `{copyright}`. `{start_of_verse: label}`/`{sov}`, chorus and bridge blocks, and `{comment: Chorus}` used as a section label. Chords in `[G]` brackets are stripped.
- **CCLI SongSelect `.usr`:** INI-style. `Title`, `Author` (`|`-separated), `Copyright`, `[S A<ccli>]` header, `Fields` and `Words` separated by `/t`, with `/n` as a newline.
- **SongSelect `.txt` and plain text:**
  - The first line is the title.
  - A line made only of a known label ("Verse 1", "Chorus", "Bridge", "Pre-Chorus", "Tag", "Intro", "Outro", "Ending"; case-insensitive) starts a section.
  - The CCLI footer lines ("CCLI Song # …", "© …", "For use solely with the SongSelect…") fill ccli and copyright and are not lyrics.
  - Blank lines split slides.

### Preview and commit

- `songImportPick()` opens the dialog and parses in the worker. It returns `SongImportPreview { token, total, ready, duplicates: {title, file}[], failed: {file, reason}[], categories: {name, count, songCount}[], sources: Record<string, number> }`. "Ready" counts songs that will be created.
- **Duplicate rule:** the title is normalised (case, punctuation and whitespace ignored). A title that matches an existing library song is skipped. A title that matches another song earlier in the same batch is also skipped, and both cases are listed.
- `songImportCommit(token, { categories: string[] })` writes all the selected songs and returns `{ imported: number }`. If any write fails, the songs already written in this batch are removed and an error is returned. `songImportCancel(token)` frees the pending batch.
- After a commit, the renderer reloads the song library. Imported songs are not added to any service.

### Window (sketch)

```
Import songs
  Read 512 files from “Shows”
  ✔ 487 songs ready to import
  ↷ 9 already in your library (show list)
  ✖ 4 couldn't be read (show list: file — reason)
  FreeShow categories:  [x] Songs (480)  [ ] Announcements (12)  [x] (none) (7)
                                     [Cancel]  [Import 487 songs]
```

The count on the button updates as categories are ticked. While importing, the window shows "Importing…" and its buttons are disabled.

### Reliability and tests

- Each parser is unit-tested with small invented fixtures, plus "Amazing Grace" where real-world structure is needed. FreeShow fixtures cover:
  - repeated groups numbered "Verse 1/2";
  - a chorus repeated in the layout;
  - child slides;
  - several text items;
  - an `[id, show]` pair;
  - a missing layout slide;
  - an empty show.
- Round-trip check: for every fixture, `buildSlides(lyrics, arrangement)` reproduces the source's slide texts in the source's order.
- Store-level tests cover the duplicate rules, category filtering, all-or-nothing commit and cancel.
- A smoke run imports the fixtures folder through a stubbed dialog and screenshots the summary.

## Calls made after review (builder's calls, owner may override)

1. **Ungrouped top-level slides:** a FreeShow slide with `group: null` that is listed in the layout itself, rather than as another slide's child, becomes its own section labelled "Slide 1", "Slide 2" … in order of first appearance. The song is imported with a note. No lyrics are dropped.
2. **Unique tokens:** after labelling, if two sections share an abbreviation (e.g. Pre-Chorus and Post-Chorus both give "PC"), the later section is renamed by appending a number ("Post-Chorus 2" → "PC2") until every label and abbreviation is unique. The arrangement is written with abbreviation tokens. The round-trip test enforces this.
3. **Blank slides:** FreeShow slides with no text are dropped from the arrangement (Katy's **C** key clears text when a blank screen is needed). The song gets a note: "2 blank slides left out".
4. **Notes:** the summary has a fourth line, "⚠ N imported with notes", with a list (song: note). Notes don't block the import.
5. **Non-song files:** files that aren't recognised as any supported song format (a README, a FreeShow settings `.json`, a ProPresenter `.pro`) are counted as "N other files ignored" with an expandable list, not as failures. A file that *is* recognised but can't be parsed is a failure with a reason. A `.txt` with no lyric lines after the title is ignored.
6. **Category defaults (revised after final review):** every FreeShow category is ticked by default, including "(none)", except known non-song values: exactly `info` or `presentation`, or a value containing (case-insensitive) `announce`, `sermon`, `scripture`, `bible` or `notice`. Labels: FreeShow's built-in ids are capitalised (`Song`, `Info`, `Presentation`); a value that looks like a generated id (no spaces, at least 8 characters, mixing letters and digits) is shown as `Custom category (k3j9x0…)`; anything else is shown raw. The summary has a line "– N not imported (category unticked)" with an expandable list (title — file), after the duplicates line, so every song is accounted for. Non-FreeShow songs have no category and are always included.
7. **Duplicates vs categories:** the preview returns the full per-song list (title, file, category, matches a library song?, matches an earlier song in the batch?). The renderer recomputes the counts and duplicate list from the ticked categories, so batch-internal duplicates are judged only among ticked songs. Commit re-checks titles against the library as it stands at commit time.

## No real FreeShow samples yet (owner's decision)

The owner has no real `.show` files at hand and asked to build without them. So:
- The FreeShow parser follows FreeShow's published show format (freeshow.app/docs/format-show) and its `Show` type in the FreeShow source.
- It must be **tolerant**:
  - Accept both `{show}` and `[id, show]`.
  - Accept `meta.CCLI` and `meta.ccli`.
  - Tolerate a missing `group` or missing `children`, layout entries without `disabled`, and text values containing `<br>` or HTML entities.
  - Treat anything else unexpected as a note, never a crash.
- A FreeShow file that parses to a song with no text is a failure with a reason, so it appears in the summary.
- The first real run is the real test. INSTALL.md tells the owner to:
  1. read the summary,
  2. open a handful of imported songs (especially ones with a repeated chorus) before retiring FreeShow,
  3. keep the FreeShow folder until satisfied.

## Left to the builder

- How the worker is shared with Bible import (one worker entry with a message type is fine).
- The exact OpenSong and ChordPro edge cases beyond the ones above.
- Styling within the existing dark UI.
