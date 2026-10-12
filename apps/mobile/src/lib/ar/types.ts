// Ported verbatim from wadzzoAR/src/lib/ar/types.ts @ 3437383 — keep in sync with the web.
/**
 * ── Wadzzo AR domain types ─────────────────────────────────────────────────
 *
 * These mirror what `LocationGroup` + `Location` + `LocationConsumer` +
 * `Creator` can produce in one query, flattened the way the UI actually
 * consumes it. Deliberately close in shape to `~/types/game/location.ts` in
 * the main webapp so the tRPC routers can hydrate this directly — but with
 * camelCase names, real `Date`-able ISO strings, and the derived fields
 * (rarity, status, distance) the game UI needs and the old payload lacks.
 */

/**
 * How a pin proves you're physically there. One per pin, chosen when the
 * brand places it, because the right method depends on the physical context:
 * a mural can't have a QR sticker, a basement café can't rely on GPS.
 */
export type DetectionMethod = "gps" | "qr" | "image";

/**
 * Access tier. Not a column — derived from `ItemPrivacy` plus where the drop's
 * subscription sits in its creator's own tier ladder, so a brand never picks
 * its own rarity and the ladder stays comparable across brands.
 * @see deriveRarity
 */
export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

/**
 * Everything that decides whether the Capture button is live. Ordered by
 * precedence: a collected pin reads "collected" even if it has also expired,
 * because that's the fact the collector cares about.
 */
export type PinStatus =
  | "collected"
  | "expired"
  | "depleted"
  | "locked"
  | "collectible";

/** `LocationGroup.type` — what kind of stop the brand says this is. */
export type ArPinType = "EVENT" | "BOUNTY" | "EXPERIENCE" | "LAUNCH" | "OTHER" | "LANDMARK";

export interface ArPin {
  id: string;
  type: ArPinType;
  lat: number;
  lng: number;
  title: string;
  description: string;
  /** Card art. Falls back to the brand avatar server-side, never empty. */
  imageUrl: string;
  link: string | null;

  brandId: string;
  brandName: string;
  brandImageUrl: string;

  /** Claims left in the drop. 0 means depleted for everyone. */
  remaining: number;
  /**
   * Original drop size, or null when the brand set no real cap. Most live
   * drops are uncapped (`LocationGroup.limit` is a 999999 sentinel), so any
   * "x of y" display has to omit the denominator rather than print it.
   */
  supply: number | null;
  /**
   * Resolved server-side: ranking a tier needs the creator's whole ladder,
   * which no single pin row carries.
   */
  rarity: Rarity;

  /** Claimed without tapping Capture, if the collector opted in. */
  autoCollect: boolean;
  detection: DetectionMethod;

  /** ISO. Null means the drop never expires. */
  endsAt: string | null;

  // ── Per-collector state (null / false for a logged-out viewer) ──────────
  collected: boolean;
  collectedAt: string | null;
  redeemCode: string | null;
  isRedeemed: boolean | null;
  /**
   * Gated behind something the viewer hasn't met — following the brand, or
   * holding enough of its token. Every pin is visible to everyone; this is
   * what decides whether it can be captured, not whether it's on the map.
   */
  locked: boolean;
  /** Why it's locked, phrased as the action that unlocks it. Null if open. */
  lockReason: string | null;

  /**
   * This drop's own `LocationTag` labels. Distinct from `ArBrand.categories`,
   * which is the union of these across everything a brand has out — these are
   * what *this* drop was tagged with.
   */
  tags: string[];
}

export interface ArBrand {
  id: string;
  name: string;
  /** `Creator.vanityURL`, falling back to a truncated pubkey. */
  handle: string;
  /**
   * No column backs this — `Creator` has a `bio` but no short line. Null
   * rather than a slice of the bio, which would just print the same words
   * twice on the brand page.
   */
  tagline: string | null;
  bio: string;
  avatarUrl: string;
  coverUrl: string | null;
  /** `Creator.approved` — the platform's own admin check, not a vanity badge. */
  verified: boolean;
  followed: boolean;
  followers: number;
  /** Live, approved drops this brand currently has on the map. */
  pinCount: number;
  /** The creator's own `LocationTag` labels, across their drops. */
  categories: string[];
  /**
   * No column backs this either. `LocationGroup` has coordinates but nothing
   * names a place, and reverse-geocoding every brand to print one word isn't
   * worth the round trips.
   */
  region: string | null;
}

export interface ArUser {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string;
  /** Truncated Stellar pubkey, shown on the profile. */
  pubkey: string;
  joinedAt: string;
  collectedCount: number;
  brandsFollowed: number;
  /** Distance walked while collecting, in metres. A vanity stat, on purpose. */
  distanceTravelled: number;
  balance: number;
}

export interface ArSettings {
  /** Claim eligible pins automatically as you walk past them. */
  autoCollect: boolean;
  /** Show only pins from brands you follow. */
  followingOnly: boolean;
  haptics: boolean;
  sound: boolean;
  /** Keep the map rotated to your heading instead of north-up. */
  compassMode: boolean;
}

/** What the user is doing on the map, for the travel-mode direction sheet. */
export type TravelMode = "walk" | "cycle" | "transit" | "drive";

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * A live GPS fix. `heading` and `speed` come straight off the Geolocation
 * API and are null indoors or when stationary — the puck has to cope.
 */
export interface GeoFix extends Coords {
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  /** The OS flagged this fix as simulated (Android mock provider). */
  mocked?: boolean;
}
