# Katy-Presenter

Free worship presentation software for Windows and Mac: a song library, service lists, themes and
image/video backgrounds, shown full-screen on a projector or TV.

**Users:** see [INSTALL.md](INSTALL.md).

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev        # run the app with hot reload
npm test           # unit tests (lyrics parser, storage, scripture, Bible import)
npm run typecheck
npm run bibles     # regenerate the built-in Bibles (needs internet)
```

### Building installers

```bash
npm run dist:mac   # → dist/*.dmg (Apple Silicon + Intel), run on a Mac
npm run dist:win   # → dist/*.exe, run on Windows
```

Or push a tag such as `v0.1.0` to GitHub. [.github/workflows/release.yml](.github/workflows/release.yml)
builds both installers on GitHub's free Windows and macOS runners and attaches them to a draft Release.
Put that repository's `owner/name` in **Settings → Updates** and the app tells users when a new version is out.

### Code signing (optional, later)

The installers are unsigned, so users see a one-time warning (see INSTALL.md). To remove it:

- **Mac:** Apple Developer Program ($99/year). Replace `identity: '-'` in `electron-builder.yml` with your
  Developer ID, set `hardenedRuntime: true`, and add notarization.
- **Windows:** Azure Artifact Signing (~$9.99/month, individuals in the US/Canada only) or an OV certificate
  ($150–300/year). SmartScreen warnings fade as the app builds a reputation.

## How it's built

| Area | Files |
| --- | --- |
| Electron main process (windows, projector placement, storage, IPC) | `src/main/` |
| Preload bridge — the only API the UI can use | `src/preload/index.ts` |
| Shared types, lyrics → slides parser, reference parser (`scripture.ts`), starter themes | `src/shared/` |
| Bibles: store, search, importers (Zefania, OpenSong, OSIS, USFX, OpenLP), import worker | `src/main/bible/` |
| Operator UI (React + Zustand) | `src/renderer/src/control/` |
| Projector screen | `src/renderer/src/output/` |
| One slide renderer used for thumbnails, previews and the projector | `src/renderer/src/components/SlideRenderer.tsx` |

The library is stored as plain JSON files plus a `media/` folder in the app's data directory.
The UI only talks to Electron through `window.api`, so a browser version can be added later by
providing another implementation of that interface.

Visual smoke test (dev only): `KATY_SMOKE=/tmp/katy-smoke npm run dev` drives the UI with a throwaway
library and saves screenshots of both windows to that folder.

## Built-in Bibles

The KJV, ASV, WEB and BSB (all public domain) live in `resources/bibles/*.json.gz` and ship inside the installer. Copyrighted translations (NIV, ESV, etc.) are never bundled; users import their own licensed files in **Settings → Bibles**. Regenerate them from `seven1m/open-bibles` with `npm run bibles` (optionally `-- --cache <dir>` to reuse downloaded sources).

## Roadmap

1. ~~Bible verses~~ (done in 0.2.0: built-in KJV/ASV/WEB/BSB, import of your own Bibles, reference lookup, word search, service-list passages).
2. Import songs from OpenLyrics XML, plain text, and ProPresenter.
3. Stage display for musicians and a phone remote over Wi-Fi.
4. NDI / livestream output.
