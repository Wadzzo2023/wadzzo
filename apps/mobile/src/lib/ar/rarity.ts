// Ported verbatim from wadzzoAR/src/lib/ar/rarity.ts @ 3437383 — keep in sync with the web.
import type { ArPin, PinStatus, Rarity } from "./types";

/**
 * ── Rarity ─────────────────────────────────────────────────────────────────
 *
 * Rarity is derived from how hard a drop is to *get into*, never set by the
 * brand directly.
 *
 * It used to be derived from drop size, which turned out to be unbackable:
 * `LocationGroup.limit` is validated in the creator form against the brand's
 * own token balance ("Collection limit can't be more than token balance"), so
 * it measures a brand's inventory ceiling, not any scarcity intent — and in
 * practice 199 of 203 live drops set it to 999999, a sentinel meaning
 * "uncapped". A ladder built on it labelled almost everything common and
 * handed mythic to whoever typed a small number while testing.
 *
 * `ItemPrivacy` is the real signal: it's a deliberate creator choice about who
 * may claim a drop, and it already exists on every `LocationGroup`.
 *
 *   PUBLIC    anyone                                    common
 *   PRIVATE   followers of the brand                    rare
 *   TIER      holders of the brand's token, by tier     epic → legendary → mythic
 *
 * Tiers rank *within a creator's own ladder* rather than against an absolute
 * price, because `Subscription.price` is denominated in that creator's page
 * asset — one brand's 50 and another's 50 aren't comparable, but "this is
 * that brand's top tier" is comparable platform-wide.
 */

/** Mirrors Prisma's `ItemPrivacy`, without importing the client into UI code. */
export type PinPrivacy =
  | "PUBLIC"
  | "PRIVATE"
  | "TIER"
  | "DRAFT"
  | "FOR_SALE"
  | "NOT_FOR_SALE";

export interface PinAccess {
  privacy: PinPrivacy;
  /** The required holding for this drop's tier. Only meaningful when TIER. */
  subscriptionPrice?: number | null;
  /** Every subscription price this creator offers, in any order. */
  creatorTierPrices?: number[];
}

/**
 * Needs the creator's whole tier ladder, which only the server can know — so
 * this runs in the pins router and ships `rarity` on the payload rather than
 * being recomputed per-component.
 */
export function deriveRarity(access: PinAccess): Rarity {
  switch (access.privacy) {
    case "PRIVATE":
      return "rare";
    case "TIER":
      break;
    default:
      // PUBLIC, plus the marketplace-only privacies the pin form never sets.
      return "common";
  }

  const price = access.subscriptionPrice;
  // Duplicate prices are collapsed first: two tiers priced the same are one
  // rung, so neither becomes a phantom "middle" that reads legendary.
  const rungs = [...new Set(access.creatorTierPrices ?? [])].sort(
    (a, b) => a - b,
  );

  // Gated, but we can't place it on a ladder — a TIER drop with no resolvable
  // subscription, or a creator with a single tier. Both are "token holders
  // only" and nothing more specific, so neither earns the top of the ladder.
  if (price == null || rungs.length < 2) return "epic";

  if (price >= rungs[rungs.length - 1]!) return "mythic";
  if (price <= rungs[0]!) return "epic";
  return "legendary";
}

export const RARITY_ORDER: Rarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

export const RARITY_META: Record<
  Rarity,
  { label: string; short: string; hsl: string; blurb: string }
> = {
  common: {
    label: "Common",
    short: "C",
    hsl: "var(--rarity-common)",
    blurb: "Open to everyone",
  },
  rare: {
    label: "Rare",
    short: "R",
    hsl: "var(--rarity-rare)",
    blurb: "Followers only",
  },
  epic: {
    label: "Epic",
    short: "E",
    hsl: "var(--rarity-epic)",
    blurb: "Token holders",
  },
  legendary: {
    label: "Legendary",
    short: "L",
    hsl: "var(--rarity-legendary)",
    blurb: "Higher tier",
  },
  mythic: {
    label: "Mythic",
    short: "M",
    hsl: "var(--rarity-mythic)",
    blurb: "Top tier",
  },
};

/**
 * Resolve the one state that drives the whole card: which badge it wears,
 * whether Capture is live, whether the foil animates.
 *
 * Precedence matters. A pin you already hold reads "collected" even if the
 * drop has since expired or sold out — what you own doesn't un-own itself.
 */
export function pinStatus(pin: ArPin, now = Date.now()): PinStatus {
  if (pin.collected) return "collected";
  if (pin.locked) return "locked";
  if (pin.endsAt && new Date(pin.endsAt).getTime() < now) return "expired";
  if (pin.remaining <= 0) return "depleted";
  return "collectible";
}

export const STATUS_META: Record<
  PinStatus,
  { label: string; tone: "green" | "gold" | "danger" | "muted" }
> = {
  collectible: { label: "Available", tone: "green" },
  collected: { label: "Collected", tone: "gold" },
  expired: { label: "Expired", tone: "danger" },
  depleted: { label: "All claimed", tone: "danger" },
  locked: { label: "Locked", tone: "muted" },
};

/** Only `collectible` pins can ever be captured — in AR or anywhere else. */
export function isCapturable(pin: ArPin, now = Date.now()): boolean {
  return pinStatus(pin, now) === "collectible";
}

/**
 * "3 days left" / "4h left" / "Ends soon". Returns null for drops with no end
 * date so callers can omit the row entirely rather than print "never".
 */
export function timeRemaining(endsAt: string | null, now = Date.now()) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return { label: "Expired", urgent: true };

  const hours = ms / 3_600_000;
  if (hours < 1) return { label: "Ends within the hour", urgent: true };
  if (hours < 24) return { label: `${Math.floor(hours)}h left`, urgent: true };

  const days = Math.floor(hours / 24);
  return { label: `${days} day${days === 1 ? "" : "s"} left`, urgent: days <= 2 };
}
