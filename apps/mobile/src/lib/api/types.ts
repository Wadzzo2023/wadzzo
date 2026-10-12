import type { ArBrand, ArPin, Rarity } from "~/lib/ar/types";

/**
 * Response shapes of /api/mobile/v1 — the JSON form of the tRPC procedures
 * they wrap (dates arrive as ISO strings). Keep in step with docs/02-api.md.
 */
export type { ArBrand, ArPin };

export type WalletType = "emailPass" | "google" | "apple" | "albedo" | string;

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  walletType: WalletType;
  emailVerified: boolean;
}

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  bio: string | null;
  image: string | null;
  coverImage: string | null;
  joinedAt: string | null;
  signUpMethod: string | null;
  walletType: WalletType;
  followingCount: number;
  collectedCount: number;
}

export interface Balance {
  assetCode: string;
  balance: number;
  hasTrustline: boolean;
}

export interface PinPage {
  pins: ArPin[];
  total: number;
  nextCursor: number | null;
}

export interface CollectionPage extends PinPage {
  facets: {
    total: number;
    brands: number;
    best: Rarity;
    counts: Record<Rarity, number>;
  };
}

export type FollowResult =
  | { followed: boolean }
  | { needsSignature: true; xdr: string };

// ── Bounty ────────────────────────────────────────────────────────────────

export type EntryStatus = "UNCHECKED" | "CHECKED" | "ONREVIEW" | "APPROVED" | "REJECTED";

export interface BountyCard {
  id: number;
  title: string;
  imageUrl: string | null;
  brand: { id: string; name: string; avatarUrl: string | null };
  rewardUsd: number;
  rewardAsset: number;
  assetCode: string;
  totalWinners: number;
  spotsLeft: number;
  participants: number;
  requiredBalance: number;
  endDate: string | null;
  createdAt: string;
  open: boolean;
  viewer: {
    joined: boolean;
    won: boolean;
    entryCount: number;
    latestEntryStatus: EntryStatus | null;
  };
}

export interface BountyDetail extends BountyCard {
  description: string;
  imageUrls: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
  totalEntries: number;
  commentCount: number;
  isOwner: boolean;
}

export interface BountyPage {
  items: BountyCard[];
  nextCursor: number | null;
}

export interface EntryMedia {
  id?: number;
  url: string;
  name: string;
  size: number;
  type: string;
}

export interface Entry {
  id: number;
  content: string;
  status: EntryStatus;
  createdAt: string;
  medias: EntryMedia[];
}

export interface CommentAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

export interface Reply {
  id: number;
  content: string;
  createdAt: string;
  author: CommentAuthor;
  mine: boolean;
}

export interface Comment extends Reply {
  replies: Reply[];
}

export interface ThreadMessage {
  id: number;
  content: string;
  fromBrand: boolean;
  createdAt: string;
}

export interface AttentionItem {
  kind: "won" | "reply";
  bountyId: number;
  title: string;
  at: string;
}

export interface SignedUpload {
  uploadUrl: string;
  fileUrl: string;
  fileName: string;
}

// ── Events & announcements ─────────────────────────────────────────────────
// Mirrors wadzzoAR/src/lib/ar/types.ts — `/events*` and `/announcements*`.

/** The brand line shown on every event and announcement. */
export interface ArEventBrand {
  id: string;
  name: string;
  imageUrl: string;
}

export interface ArEventCard {
  id: string;
  title: string;
  coverImage: string | null;
  startDate: string;
  /** Null for a single-moment event; treat it as ending when it starts. */
  endDate: string | null;
  venueName: string | null;
  address: string | null;
  /** True when a lat/lng was set — the detail page shows a mini map. */
  hasVenue: boolean;
  /** True when the brand added a ticket / livestream / registration link. */
  hasLink: boolean;
  brand: ArEventBrand;
  goingCount: number;
  /** Null = unlimited RSVPs. */
  capacity: number | null;
  viewer: { going: boolean };
}

export interface ArEventDetail extends ArEventCard {
  description: string;
  latitude: number | null;
  longitude: number | null;
  link: string | null;
  linkLabel: string | null;
  /** Linked drops — `id` is a `Location` id, the same one `pins.byId` takes. */
  pins: { id: string; title: string; imageUrl: string }[];
  bounties: { id: number; title: string; imageUrl: string | null }[];
  commentCount: number;
  isFull: boolean;
  isPast: boolean;
}

export interface ArAnnouncement {
  id: string;
  title: string;
  body: string;
  images: string[];
  pinned: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  brand: ArEventBrand;
  commentCount: number;
}

export type ArCommentTarget = { kind: "event" | "announcement"; id: string };

export interface EventComment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  mine: boolean;
}

export interface EventPage {
  items: ArEventCard[];
  nextCursor: string | null;
}

export interface AnnouncementPage {
  items: ArAnnouncement[];
  nextCursor: string | null;
}
