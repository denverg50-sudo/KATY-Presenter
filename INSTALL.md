# Installing Katy-Presenter

Katy-Presenter is free and isn't yet signed with paid Apple or Microsoft certificates.
Because of that, your computer shows a **one-time warning** the first time you open it.
This is normal. Follow the steps below once, and after that it opens like any other app.

---

## Windows (10 and 11)

1. Download **`Katy-Presenter-Setup-x.y.z.exe`**.
2. Double-click it.
3. If a blue **"Windows protected your PC"** box appears:
   - Click **More info**.
   - Click **Run anyway**.
4. The app installs by itself (no admin password needed) and opens.
   A **Katy-Presenter** shortcut appears on your desktop and in the Start menu.

**To uninstall:** Settings → Apps → Installed apps → Katy-Presenter → Uninstall.
Your songs are kept, so a reinstall picks up where you left off.

---

## Mac (macOS 12 Monterey or newer)

1. Download the right file for your Mac:
   - **Apple Silicon (M1, M2, M3, M4…)**: `Katy-Presenter-x.y.z-mac-arm64.dmg`
   - **Older Intel Macs**: `Katy-Presenter-x.y.z-mac-x64.dmg`
   - Not sure? Apple menu  → **About This Mac**. "Chip: Apple M…" means Apple Silicon.
2. Open the `.dmg` and drag **Katy-Presenter** into **Applications**.
3. Open **Applications** and double-click **Katy-Presenter**.
   macOS says it *"could not verify Katy-Presenter is free of malware"*. Click **Done**.
4. Open **System Settings → Privacy & Security**, scroll down, and next to
   *"Katy-Presenter was blocked…"* click **Open Anyway**. Enter your Mac password if asked.
5. Click **Open Anyway** again. From now on it opens normally.

---

## Connecting the projector or TV

1. Plug in the projector or TV **before or after** opening the app. Either way works.
2. Set the computer to **Extend** the display, not Mirror:
   - **Windows:** press **Win + P** and choose **Extend**.
   - **Mac:** System Settings → Displays → choose the projector → **Use as: Extended display**.
3. The lyrics screen goes full screen on the projector automatically.
   To pick a different screen: **⚙ Settings → Output screen**.

No projector right now? With only one screen, the output opens in a small preview window, so you can practise anywhere.

---

## Keyboard shortcuts while presenting

| Key | Action |
| --- | --- |
| → , ↓ , Space, Page Down | Next slide (continues into the next song in the service) |
| ← , ↑ , Page Up | Previous slide |
| B | Black screen on/off |
| C | Hide lyrics, keep the background |
| L | Show the logo (set it in Settings) |
| Esc | Clear everything |

Most clickers and presentation remotes send Page Up/Page Down, so they work straight away.

---

## Bibles

Click the **Bible** tab, pick a translation, and type what you want to show:

- `John 3:16`, `jn 3:16-18`, `1co 13 4`, or `Ps 23` (a whole chapter).
- Or type words, like `love one another`, to search the whole Bible and click a result.

Once a passage is showing, the bar above the verse slides lets you change that passage's translation, **verses per slide (1, 2 or 3)** and theme. Use **Add to service** to put a passage in the service list next to your songs. The starting choices (default translation, **Scripture theme**, verses per slide, and whether to show verse numbers) are in **⚙ Settings → Bibles**.

**Included Bibles:** King James (KJV), American Standard (ASV), World English (WEB) and Berean Standard (BSB). These are free to use and work with no internet.

**Adding your own Bible (NIV, NKJV, ESV, NLT, The Message…):** these are copyrighted, so they are not included. If your church has permission to use one and has the file:

1. Open **⚙ Settings → Bibles → Import Bible…** and choose the file.
2. An **Import Bible** window opens showing how many books, chapters and verses were found, and any books that were skipped or are missing. Check that it looks right.
3. Edit the **Name** and **Abbreviation** if you like (the abbreviation, such as NIV, is what shows on screen). If you already have a Bible with that abbreviation, choose **Replace existing** or **Add as new**.
4. Click **Add Bible**. Nothing is added until you do. It then appears in the Bible tab's translation list.

You are responsible for having permission to use any Bible you import.

Files that work: Zefania XML, OpenSong XML (including `.xmm`), OSIS XML, USFX, OpenLP Bible database (`.sqlite`), and OpenLP CSV (select the books file and the verses file together). In Settings → Bibles you can change a Bible's abbreviation or delete Bibles you imported; the built-in ones can't be deleted.

---

## Where your songs are stored

- **Windows:** `%APPDATA%\Katy-Presenter\library`
- **Mac:** `~/Library/Application Support/Katy-Presenter/library`

Use **⚙ Settings → Back up library…** to save everything (songs, themes, services, backgrounds) into one `.zip` file.
Use **Restore backup…** to load it on another computer.
