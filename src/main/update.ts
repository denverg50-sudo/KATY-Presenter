import { app, net } from 'electron'
import type { UpdateInfo } from '../shared/types'

function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

/**
 * Unsigned Mac apps can't install updates themselves, so we only check GitHub Releases
 * and point the user at the download page.
 */
export async function checkForUpdate(repo: string): Promise<UpdateInfo | null> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return null
  try {
    const res = await net.fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KatyPresenter' }
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name: string; html_url: string }
    const current = app.getVersion()
    return { current, latest: data.tag_name, url: data.html_url, available: newer(data.tag_name, current) }
  } catch {
    return null
  }
}
