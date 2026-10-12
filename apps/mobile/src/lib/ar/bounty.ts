import { differenceInHours, formatDistanceToNowStrict } from "date-fns";

import type { Tone } from "~/components/ui/Badges";
import type { BountyCard, EntryStatus } from "~/lib/api/types";

/** Port of wadzzoAR/src/lib/ar/bounty.ts — same words, same tones. */

export const ENTRY_STATUS: Record<EntryStatus, { label: string; tone: Tone }> = {
  UNCHECKED: { label: "Sent", tone: "muted" },
  CHECKED: { label: "Seen", tone: "info" },
  ONREVIEW: { label: "In review", tone: "info" },
  APPROVED: { label: "Approved", tone: "green" },
  REJECTED: { label: "Not selected", tone: "danger" },
};

export function viewerBadge(b: Pick<BountyCard, "viewer" | "open">): { label: string; tone: Tone } {
  if (b.viewer.won) return { label: "You won", tone: "gold" };
  if (b.viewer.latestEntryStatus) return ENTRY_STATUS[b.viewer.latestEntryStatus];
  if (!b.open) return { label: "Closed", tone: "muted" };
  if (b.viewer.joined) return { label: "Joined", tone: "green" };
  return { label: "Open", tone: "green" };
}

export const formatUsd = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: n < 10 ? 2 : 0 });

export const formatAmount = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function deadlineLabel(endDate: string | null) {
  if (!endDate) return null;
  const end = new Date(endDate);
  if (end.getTime() <= Date.now()) return { text: "Ended", urgent: false };
  return { text: `${formatDistanceToNowStrict(end)} left`, urgent: differenceInHours(end, new Date()) < 48 };
}
