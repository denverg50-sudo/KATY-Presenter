import { useEffect, useState } from 'react'
import type { LiveState } from '@shared/types'
import { SlideRenderer } from '../components/SlideRenderer'

/** The audience screen: draws whatever the control window sends, nothing else. */
export function OutputApp() {
  const [live, setLive] = useState<LiveState | null>(null)

  useEffect(() => {
    void window.api.getLive().then((s) => s && setLive(s))
    return window.api.onLive(setLive)
  }, [])

  return (
    <SlideRenderer
      className="output-slide"
      text={live?.text ?? null}
      theme={live?.theme ?? null}
      black={live?.black}
      logo={live?.logo}
      logoMedia={live?.logoMedia}
      transitionMs={live?.transitionMs ?? 400}
    />
  )
}
