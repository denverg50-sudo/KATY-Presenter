# Selah Presenter

Free worship presentation software for Windows and Mac: a song library, service lists, themes and
image/video backgrounds, shown full-screen on a projector or TV.

**Users:** see [INSTALL.md](INSTALL.md).

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev        # run the app with hot reload
npm test           # unit tests (lyrics parser, storage)
npm run typecheck
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
| Shared types, lyrics → slides parser, starter themes | `src/shared/` |
| Operator UI (React + Zustand) | `src/renderer/src/control/` |
| Projector screen | `src/renderer/src/output/` |
| One slide renderer used for thumbnails, previews and the projector | `src/renderer/src/components/SlideRenderer.tsx` |

The library is stored as plain JSON files plus a `media/` folder in the app's data directory.
The UI only talks to Electron through `window.api`, so a browser version can be added later by
providing another implementation of that interface.

Visual smoke test (dev only): `SELAH_SMOKE=/tmp/selah-smoke npm run dev` drives the UI with a throwaway
library and saves screenshots of both windows to that folder.

## Roadmap

1. Bible verses: bundle public-domain KJV / WEB / BSB (OSIS, USFX, Zefania formats from `seven1m/open-bibles`).
2. Import songs from OpenLyrics XML, plain text, and ProPresenter.
3. Stage display for musicians and a phone remote over Wi-Fi.
4. NDI / livestream output.
