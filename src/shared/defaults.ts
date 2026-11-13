import type { Background, Settings, Song, Theme } from './types'

export const DEFAULT_THEME_ID = 'theme-classic'

export function newBackground(over: Partial<Background> = {}): Background {
  return { type: 'color', color: '#000000', gradient: '', media: '', dim: 0, ...over }
}

export function newTheme(over: Partial<Theme> = {}): Theme {
  return {
    id: crypto.randomUUID(),
    name: 'New theme',
    fontFamily: 'Helvetica Neue, Arial, sans-serif',
    fontSize: 96,
    color: '#ffffff',
    bold: true,
    italic: false,
    uppercase: false,
    textAlign: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.25,
    padding: 6,
    shadow: true,
    outline: 0,
    outlineColor: '#000000',
    band: false,
    bandColor: 'rgba(0,0,0,0.6)',
    background: newBackground(),
    updatedAt: Date.now(),
    ...over
  }
}

export function starterThemes(): Theme[] {
  return [
    newTheme({ id: DEFAULT_THEME_ID, name: 'Classic Black' }),
    newTheme({
      id: 'theme-deep-blue',
      name: 'Deep Blue',
      background: newBackground({
        type: 'gradient',
        gradient: 'linear-gradient(135deg, #0b1d3a 0%, #1d4e89 55%, #3a7bd5 100%)'
      })
    }),
    newTheme({
      id: 'theme-sunrise',
      name: 'Sunrise',
      fontFamily: 'Georgia, serif',
      bold: false,
      background: newBackground({
        type: 'gradient',
        gradient: 'linear-gradient(160deg, #2b1055 0%, #7597de 45%, #f6a35c 100%)'
      })
    }),
    newTheme({
      id: 'theme-forest',
      name: 'Forest',
      background: newBackground({
        type: 'gradient',
        gradient: 'radial-gradient(circle at 30% 20%, #3e7c59 0%, #1b3b2a 60%, #0c1a12 100%)'
      })
    }),
    newTheme({
      id: 'theme-lower-third',
      name: 'Lower Third (livestream)',
      fontSize: 64,
      verticalAlign: 'bottom',
      padding: 4,
      band: true,
      background: newBackground({ type: 'color', color: '#00b140' })
    })
  ]
}

export function newSong(over: Partial<Song> = {}): Song {
  return {
    id: crypto.randomUUID(),
    title: 'Untitled song',
    author: '',
    ccli: '',
    copyright: '',
    lyrics: '',
    arrangement: '',
    themeId: '',
    updatedAt: Date.now(),
    ...over
  }
}

/** Public-domain hymn (John Newton, 1779) so the library isn't empty on first launch */
export function sampleSongs(): Song[] {
  return [
    newSong({
      id: 'song-amazing-grace',
      title: 'Amazing Grace',
      author: 'John Newton',
      copyright: 'Public Domain',
      lyrics: `[Verse 1]
Amazing grace! How sweet the sound
That saved a wretch like me!

I once was lost, but now am found;
Was blind, but now I see.

[Verse 2]
'Twas grace that taught my heart to fear,
And grace my fears relieved;

How precious did that grace appear
The hour I first believed.

[Verse 3]
Through many dangers, toils and snares,
I have already come;

'Tis grace hath brought me safe thus far,
And grace will lead me home.

[Verse 4]
When we've been there ten thousand years,
Bright shining as the sun,

We've no less days to sing God's praise
Than when we'd first begun.`
    })
  ]
}

export function defaultSettings(): Settings {
  return {
    outputDisplayId: null,
    windowedOutput: false,
    outputVisible: true,
    defaultThemeId: DEFAULT_THEME_ID,
    logoMedia: '',
    transitionMs: 400,
    updateRepo: 'denverg50-sudo/KATY-Presenter'
  }
}
