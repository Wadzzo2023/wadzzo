import type { ArPinType } from "~/lib/ar/types";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── Website embed config ───────────────────────────────────────────────────
 *
 * What `/embed/[id]` needs from a `MapEmbed` row, in a JSON-safe shape (it
 * crosses getServerSideProps). The same shape is what brand-wadzzo's editor
 * sends for a live preview (`/embed/preview?c=…`), so the preview and the
 * saved embed render through exactly one code path.
 */
export interface EmbedConfig {
  /** Row id, or "preview" for the editor's unsaved preview. */
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
  userLocation: boolean;
  gestureMode: "COOPERATIVE" | "GREEDY";
  theme: "AUTO" | "LIGHT" | "DARK";
  accentColor: string;
  /** "CREATOR" = only the embed owner's pins; "ALL" = every brand's. */
  pinSource: "ALL" | "CREATOR";
  /** The embed owner (a Creator id). Null only for a malformed preview. */
  creatorId: string | null;
  pinTypes: ArPinType[];
  showFilterChips: boolean;
  showSearch: boolean;
  showNearby: boolean;
  /** Approved murals in view (wadzzoAR docs/murals/plan.md §7; on by default). */
  showMurals: boolean;
  eventsLabel: string;
  eventsUrl: string | null;
  bountiesLabel: string;
  bountiesUrl: string | null;
}

export const PIN_TYPE_LABEL: Record<ArPinType, string> = {
  EVENT: "Events",
  LANDMARK: "Landmarks",
  EXPERIENCE: "Experiences",
  LAUNCH: "Launches",
  BOUNTY: "Bounties",
  OTHER: "Other",
};
export const ALL_PIN_TYPES = Object.keys(PIN_TYPE_LABEL) as ArPinType[];

const PIN_TYPES = new Set<string>(ALL_PIN_TYPES);
const HEX = /^#[0-9a-f]{6}$/i;

const httpUrl = (v: unknown): string | null => {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};
const num = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
const text = (v: unknown, dflt: string, max = 40) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : dflt;

/**
 * Coerce anything (a DB row, or the editor's preview JSON — untrusted) into a
 * valid config. Unknown or out-of-range values fall back to defaults rather
 * than failing: a half-typed preview should still render.
 */
export function normalizeConfig(raw: Record<string, unknown>, id: string): EmbedConfig {
  const pinTypes = Array.isArray(raw.pinTypes)
    ? (raw.pinTypes.filter((t) => typeof t === "string" && PIN_TYPES.has(t)) as ArPinType[])
    : [];
  return {
    id,
    name: text(raw.name, `${platformBranding.name} map`, 80),
    centerLat: num(raw.centerLat, -85, 85, 39.5),
    centerLng: num(raw.centerLng, -180, 180, -98.35),
    zoom: num(raw.zoom, 2, 18, 12),
    userLocation: raw.userLocation === true,
    gestureMode: raw.gestureMode === "GREEDY" ? "GREEDY" : "COOPERATIVE",
    theme: raw.theme === "LIGHT" || raw.theme === "DARK" ? raw.theme : "AUTO",
    accentColor: typeof raw.accentColor === "string" && HEX.test(raw.accentColor) ? raw.accentColor : platformBranding.colors.embedAccent,
    pinSource: raw.pinSource === "CREATOR" ? "CREATOR" : "ALL",
    creatorId: typeof raw.creatorId === "string" && raw.creatorId ? raw.creatorId : null,
    pinTypes,
    showFilterChips: raw.showFilterChips === true,
    showSearch: raw.showSearch !== false,
    showNearby: raw.showNearby !== false,
    showMurals: raw.showMurals !== false,
    eventsLabel: text(raw.eventsLabel, "Find Events"),
    eventsUrl: httpUrl(raw.eventsUrl),
    bountiesLabel: text(raw.bountiesLabel, "View Bounties"),
    bountiesUrl: httpUrl(raw.bountiesUrl),
  };
}

/** Base64url JSON — how the editor passes an unsaved config to the preview. */
export function decodePreview(c: string | undefined): Record<string, unknown> | null {
  if (!c) return null;
  try {
    const json = Buffer.from(c.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Origins of brand-wadzzo, which may always frame embeds (editor preview). */
export function brandOrigins(): string[] {
  return (process.env.BRAND_APP_ORIGINS ?? `${platformBranding.urls.brandPortal} http://localhost:3001`)
    .split(/[\s,]+/)
    .filter(Boolean);
}

/** "https://www.Example.gov/path" → "example.gov"; null if it isn't a hostname. */
export function normalizeDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host) return null;
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)$/.test(host) ? host : null;
}

/**
 * The CSP `frame-ancestors` list. The browser enforces it, so a site that
 * copies the snippet but isn't on the allowlist gets a refused frame — unlike
 * a Referer check, it can't be spoofed from the embedding page.
 *
 * Each domain also covers its subdomains (www., maps., …) and both schemes
 * (plenty of small-town sites are still on http). brand-wadzzo is always
 * allowed so the editor's preview works. Empty allowlist = any site.
 */
export function frameAncestors(domains: string[]): string {
  const hosts = domains.map(normalizeDomain).filter((d): d is string => Boolean(d));
  if (hosts.length === 0) return "frame-ancestors *";
  const sources = hosts.flatMap((h) =>
    h === "localhost"
      ? ["http://localhost:*", "https://localhost:*"]
      : [`https://${h}`, `https://*.${h}`, `http://${h}`, `http://*.${h}`],
  );
  return `frame-ancestors 'self' ${[...brandOrigins(), ...sources].join(" ")}`;
}

/** "#39ff88" → "146 100% 61%" — the triplet format the `--ar-*` tokens use. */
export function hexToHslTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Brighter / darker companions for the accent, clamped to stay readable. */
export function accentVars(hex: string): Record<string, string> {
  const [h, s, l] = hexToHslTriplet(hex).split(" ");
  const L = parseInt(l!, 10);
  return {
    "--ar-green": `${h} ${s} ${L}%`,
    "--ar-green-hot": `${h} ${s} ${Math.min(L + 12, 85)}%`,
    "--ar-green-deep": `${h} ${s} ${Math.max(L - 16, 18)}%`,
    // Text on an accent-filled button: dark on light accents, white on dark.
    "--ar-green-ink": L > 55 ? "150 60% 6%" : "0 0% 100%",
  };
}

/** The brand to restrict pins to, or undefined for every brand. */
export const brandFilter = (c: Pick<EmbedConfig, "pinSource" | "creatorId">) =>
  c.pinSource === "CREATOR" && c.creatorId ? c.creatorId : undefined;

export type EmbedEvent = "view" | "pinTap" | "open" | "events" | "bounties";
