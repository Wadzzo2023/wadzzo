/**
 * When a hotspot drops its pins. The worker looks at every active hotspot every few minutes and
 * asks `hotspotAction` what to do, so nothing is kept in memory: a restart, or a worker that was
 * down for an hour, just catches up on the next look.
 *
 * Drops fall on slots: the anchor plus a whole number of `dropEveryDays`. A drop made a few
 * minutes after its slot does not move the following slots (no drift).
 */

export const DAY_MS = 86_400_000;

/** Looks happen every few minutes, and a drop can land a little before or after its moment. */
export const START_TOLERANCE_MS = 60_000;

type Drop = { hidden: boolean; startDate: Date; createdAt: Date };

/**
 * A hotspot that starts in the future gets its first drop made up front, hidden, dated for the
 * start (it carries the title, image and so on that every later drop copies). It is recognisable
 * because it was made well before its start; once released, startDate and createdAt are both reset
 * to the release time.
 */
export function isPendingFirstDrop(group: Drop) {
  return group.hidden && group.startDate.getTime() - group.createdAt.getTime() > START_TOLERANCE_MS;
}

/** Drops repeat from the start, or from when the hotspot was made if that is later. */
export function dropAnchor(hotspot: { hotspotStartDate: Date; createdAt: Date }) {
  return hotspot.hotspotStartDate > hotspot.createdAt
    ? hotspot.hotspotStartDate
    : hotspot.createdAt;
}

/** The latest slot at or before `now`, or null before the first one. */
export function lastDueSlot(anchor: Date, everyDays: number, now: Date): Date | null {
  const elapsed = now.getTime() - anchor.getTime();
  if (elapsed < 0) return null;
  const cycle = everyDays * DAY_MS;
  return new Date(anchor.getTime() + Math.floor(elapsed / cycle) * cycle);
}

/** The first slot after `now` (the anchor itself while it is still ahead). */
export function nextSlot(anchor: Date, everyDays: number, now: Date): Date {
  const elapsed = now.getTime() - anchor.getTime();
  if (elapsed < 0) return anchor;
  const cycle = everyDays * DAY_MS;
  return new Date(anchor.getTime() + (Math.floor(elapsed / cycle) + 1) * cycle);
}

export type HotspotAction = "none" | "drop" | "release" | "end";

/**
 * What to do for one hotspot at `now`:
 *  - `end`: its end date has passed; close it.
 *  - `release`: the first drop, made hidden ahead of the start, is due to go live.
 *  - `drop`: a slot has passed with no drop made for it.
 *  - `none`: nothing yet.
 */
export function hotspotAction(
  hotspot: {
    isActive: boolean;
    dropEveryDays: number;
    hotspotStartDate: Date;
    hotspotEndDate: Date;
    createdAt: Date;
  },
  state: {
    /** startDate of the newest visible drop, or null if there is none. */
    latestDropStart: Date | null;
    /** The first drop is made, hidden, and waits for the start date. */
    pendingFirstDrop: boolean;
  },
  now: Date,
): HotspotAction {
  if (!hotspot.isActive) return "none";
  if (now > hotspot.hotspotEndDate) return "end";

  const started = now.getTime() >= hotspot.hotspotStartDate.getTime() - START_TOLERANCE_MS;
  if (state.pendingFirstDrop) return started ? "release" : "none";
  if (!started) return "none";

  const slot = lastDueSlot(dropAnchor(hotspot), hotspot.dropEveryDays, now);
  if (!slot) return "none";
  if (
    state.latestDropStart &&
    state.latestDropStart.getTime() >= slot.getTime() - START_TOLERANCE_MS
  )
    return "none";
  return "drop";
}

/** The next drop, for the hotspot's page. Nothing while it is paused or once it has run out. */
export function hotspotSchedule(
  hotspot: {
    isActive: boolean;
    dropEveryDays: number;
    hotspotStartDate: Date;
    hotspotEndDate: Date;
    createdAt: Date;
  },
  pendingFirstDrop: boolean,
  now: Date,
): { hasSchedule: boolean; nextRunTime: Date | null } {
  const none = { hasSchedule: false, nextRunTime: null };
  if (!hotspot.isActive || now > hotspot.hotspotEndDate) return none;
  if (pendingFirstDrop) return { hasSchedule: true, nextRunTime: hotspot.hotspotStartDate };
  const next = nextSlot(dropAnchor(hotspot), hotspot.dropEveryDays, now);
  return next <= hotspot.hotspotEndDate ? { hasSchedule: true, nextRunTime: next } : none;
}
