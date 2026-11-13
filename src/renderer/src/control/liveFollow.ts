import { samePresentable, type Presentable } from './presentable'

/** The live picture as the store keeps it. */
export interface LiveLike {
  item: Presentable
  itemId: string | null
  index: number
}

/** An edit of the selected passage that is waiting for its new passage before the output follows it. */
export interface FollowEdit<L extends LiveLike = LiveLike> {
  seq: number
  /** Live picture when the edit began */
  from: L
  /** The edited passage */
  target: Presentable
}

/**
 * Is the selected passage the one on screen? True when live came from the same service item (or, outside a
 * service, is the same passage), or when an earlier edit of it is still waiting to re-point live.
 */
export function editFollowsLive<L extends LiveLike>(o: {
  live: L | null
  selected: Presentable
  selectedItemId: string | null
  pending: FollowEdit<L> | null
}): boolean {
  const { live, selected, selectedItemId, pending } = o
  if (!live || live.item.kind !== 'scripture') return false
  if (selectedItemId !== null) return live.itemId === selectedItemId
  if (live.itemId === null && samePresentable(live.item, selected)) return true
  return !!pending && pending.from === live && samePresentable(pending.target, selected)
}

/**
 * When an edit's passage has arrived: the live picture to re-point to the edited passage, or null to leave live alone.
 * - Only the latest edit wins (two quick edits resolve to the second).
 * - Live is only re-pointed while it still shows the same item (the operator may have stepped within it);
 *   if they went live on something else or cleared, it is left alone.
 * - If the edited passage has no slides (e.g. the translation lacks it), the old picture stays up.
 */
export function liveToFollow<L extends LiveLike>(o: {
  edit: FollowEdit<L>
  latestSeq: number
  nowLive: L | null
  newSlideCount: number
}): L | null {
  const { edit, latestSeq, nowLive, newSlideCount } = o
  if (edit.seq !== latestSeq || !nowLive || newSlideCount === 0) return null
  if (nowLive === edit.from) return nowLive
  return nowLive.itemId === edit.from.itemId && samePresentable(nowLive.item, edit.from.item) ? nowLive : null
}
