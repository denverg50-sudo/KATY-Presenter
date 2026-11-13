import { describe, it, expect } from 'vitest'
import { editFollowsLive, liveToFollow, type FollowEdit, type LiveLike } from './liveFollow'
import type { Presentable } from './presentable'

const kjv: Presentable = { kind: 'scripture', bibleId: 'kjv', ref: 'John 3:16', themeId: '', versesPerSlide: 1 }
const web: Presentable = { ...kjv, bibleId: 'web' }
const bsb: Presentable = { ...kjv, bibleId: 'bsb' }
const song: Presentable = { kind: 'song', songId: 's1' }
const live = (item: Presentable, itemId: string | null = 'i1', index = 2): LiveLike => ({ item, itemId, index })

describe('editFollowsLive', () => {
  it('follows the service item on screen', () => {
    expect(editFollowsLive({ live: live(kjv), selected: kjv, selectedItemId: 'i1', pending: null })).toBe(true)
    expect(editFollowsLive({ live: live(kjv), selected: kjv, selectedItemId: 'i2', pending: null })).toBe(false)
    expect(editFollowsLive({ live: live(song), selected: kjv, selectedItemId: 'i1', pending: null })).toBe(false)
    expect(editFollowsLive({ live: null, selected: kjv, selectedItemId: 'i1', pending: null })).toBe(false)
  })
  it('outside a service: the same passage, or one an unfinished edit is moving live to', () => {
    const l = live(kjv, null)
    expect(editFollowsLive({ live: l, selected: kjv, selectedItemId: null, pending: null })).toBe(true)
    // first edit (kjv -> web) still loading; second edit starts from web
    expect(editFollowsLive({ live: l, selected: web, selectedItemId: null, pending: null })).toBe(false)
    const pending: FollowEdit = { seq: 1, from: l, target: web }
    expect(editFollowsLive({ live: l, selected: web, selectedItemId: null, pending })).toBe(true)
    expect(editFollowsLive({ live: live(kjv, null), selected: web, selectedItemId: null, pending })).toBe(false)
  })
})

describe('liveToFollow', () => {
  const from = live(kjv)
  const edit = (seq: number, target = web): FollowEdit => ({ seq, from, target })

  it('re-points the unchanged live picture', () => {
    expect(liveToFollow({ edit: edit(1), latestSeq: 1, nowLive: from, newSlideCount: 3 })).toBe(from)
  })
  it('leaves the old picture up when the new passage has no slides', () => {
    expect(liveToFollow({ edit: edit(1), latestSeq: 1, nowLive: from, newSlideCount: 0 })).toBeNull()
  })
  it('two fast edits resolve to the latest, whichever finishes first', () => {
    const a = edit(1, web)
    const b = edit(2, bsb)
    expect(liveToFollow({ edit: b, latestSeq: 2, nowLive: from, newSlideCount: 3 })).toBe(from)
    expect(liveToFollow({ edit: a, latestSeq: 2, nowLive: from, newSlideCount: 3 })).toBeNull()
  })
  it('follows after the operator stepped within the same item', () => {
    const stepped = { ...from, index: 3 }
    expect(liveToFollow({ edit: edit(1), latestSeq: 1, nowLive: stepped, newSlideCount: 3 })).toBe(stepped)
  })
  it('never yanks live back after the operator moved on or cleared', () => {
    expect(liveToFollow({ edit: edit(1), latestSeq: 1, nowLive: live(song, 'i2', 0), newSlideCount: 3 })).toBeNull()
    expect(liveToFollow({ edit: edit(1), latestSeq: 1, nowLive: live(kjv, 'i2'), newSlideCount: 3 })).toBeNull()
    expect(liveToFollow({ edit: edit(1), latestSeq: 1, nowLive: null, newSlideCount: 3 })).toBeNull()
  })
})
