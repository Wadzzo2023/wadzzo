import { offsetBy } from "./geo";
import { deriveRarity, type PinAccess } from "./rarity";
import type { ArBrand, ArPin, ArSettings, Coords } from "./types";

/**
 * ── Mock drop ──────────────────────────────────────────────────────────────
 *
 * Milestone-1 fixtures. Nothing here touches the database; every shape is the
 * one the tRPC routers will return, so swapping `useMockPins()` for
 * `api.pins.nearby.useQuery()` is a one-line change per screen.
 *
 * Pins are defined as a bearing + distance from an anchor rather than as
 * absolute coordinates, so `projectAround()` can drop the whole set around
 * whatever real location the viewer is standing in. A demo that only works in
 * one city isn't a demo.
 */

/**
 * Anchor used when there's no real GPS fix, and the start point for the
 * simulated walk. Pins are laid out as bearing + distance from here, so
 * moving this moves the whole drop together.
 */
export const FALLBACK_CENTER: Coords = {
  lat: 23.94026782931064,
  lng: 90.29786059328437,
};

const img = (seed: string, w = 640, h = 800) =>
  `https://picsum.photos/seed/wadzzo-${seed}/${w}/${h}`;

// ─── Brands ──────────────────────────────────────────────────────────────────

export const MOCK_BRANDS: ArBrand[] = [
  {
    id: "brand-lumen",
    name: "Lumen Coffee",
    handle: "lumencoffee",
    tagline: "Third-wave roastery. Nine bars, no shortcuts.",
    bio: "We roast in small batches three streets from where you're standing. Every Lumen pin you collect is a free pour-over on your next visit — no card, no app switching, just show the code at the bar.",
    avatarUrl: img("lumen-a", 200, 200),
    coverUrl: img("lumen-c", 1200, 600),
    verified: true,
    followed: true,
    followers: 18_420,
    pinCount: 4,
    categories: ["Coffee", "Food & Drink"],
    region: "Downtown",
  },
  {
    id: "brand-museo",
    name: "Museo Nocturne",
    handle: "museonocturne",
    tagline: "After-dark contemporary art.",
    bio: "A museum that only opens when the sun goes down. Our pins sit on the works themselves — point your camera at the piece, not at a sign. Collect the full wing and the last collectible unlocks a members' preview.",
    avatarUrl: img("museo-a", 200, 200),
    coverUrl: img("museo-c", 1200, 600),
    verified: true,
    followed: true,
    followers: 42_915,
    pinCount: 5,
    categories: ["Museum", "Art & Culture"],
    region: "Arts District",
  },
  {
    id: "brand-relay",
    name: "Relay Bicycles",
    handle: "relaybikes",
    tagline: "Frames built for the long way round.",
    bio: "Ride to the pin, collect the pin. We hide drops at the top of every climb worth doing in this city. Bring the code in for a free tune-up once you've got four.",
    avatarUrl: img("relay-a", 200, 200),
    coverUrl: img("relay-c", 1200, 600),
    verified: false,
    followed: false,
    followers: 6_133,
    pinCount: 3,
    categories: ["Retail", "Sport"],
    region: "Eastside",
  },
  {
    id: "brand-nightmarket",
    name: "The Night Market",
    handle: "nightmarket",
    tagline: "Forty stalls. Thursday through Sunday.",
    bio: "Every stall hides one pin and they rotate weekly. Collect five in a night and the last one is a mythic — there are only eight of those in existence and six are already gone.",
    avatarUrl: img("market-a", 200, 200),
    coverUrl: img("market-c", 1200, 600),
    verified: true,
    followed: true,
    followers: 91_002,
    pinCount: 3,
    categories: ["Food & Drink", "Events"],
    region: "Riverside",
  },
  {
    id: "brand-atlas",
    name: "Atlas Tourism Board",
    handle: "visitatlas",
    tagline: "Official city trails and landmarks.",
    bio: "Seventeen landmarks, one trail, no signage to deface. Every stop is image-recognition: point your camera at the monument and the collectible is yours.",
    avatarUrl: img("atlas-a", 200, 200),
    coverUrl: img("atlas-c", 1200, 600),
    verified: true,
    followed: false,
    followers: 33_770,
    pinCount: 2,
    categories: ["Tourism", "Art & Culture"],
    region: "Civic Center",
  },
  {
    id: "brand-halcyon",
    name: "Halcyon Records",
    handle: "halcyonrecords",
    tagline: "Vinyl, tapes, and very loud Fridays.",
    bio: "Pins drop the same morning a record lands in the racks. Collect one and you've reserved a copy for 24 hours.",
    avatarUrl: img("halcyon-a", 200, 200),
    coverUrl: img("halcyon-c", 1200, 600),
    verified: false,
    followed: false,
    followers: 12_558,
    pinCount: 2,
    categories: ["Music", "Retail"],
    region: "Eastside",
  },
];

// ─── Pins ────────────────────────────────────────────────────────────────────

type PinSeed = Omit<ArPin, "lat" | "lng"> & {
  /** Metres from the anchor. */
  dist: number;
  /** Degrees clockwise from north. */
  bearing: number;
};

const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString();

/**
 * A stand-in creator tier ladder, so fixtures can sit on a rung the way a real
 * `Subscription` does. Every gated seed prices itself against this one list,
 * which is what `deriveRarity` ranks it within.
 */
const MOCK_TIER_PRICES = [50, 250, 1_000];

function seed(
  partial: Pick<PinSeed, "id" | "title" | "description" | "dist" | "bearing"> &
    Partial<PinSeed> & {
      brand: ArBrand;
      supply: number;
      /** Defaults to an open drop, like almost every real one. */
      access?: PinAccess;
    },
): PinSeed {
  const { brand, supply, access, ...rest } = partial;
  const resolved: PinAccess = access ?? { privacy: "PUBLIC" };
  return {
    imageUrl: img(rest.id),
    link: null,
    brandId: brand.id,
    brandName: brand.name,
    brandImageUrl: brand.avatarUrl,
    remaining: Math.ceil(supply * 0.4),
    supply,
    rarity: deriveRarity(resolved),
    autoCollect: false,
    detection: "gps",
    endsAt: iso(9),
    collected: false,
    collectedAt: null,
    redeemCode: null,
    isRedeemed: null,
    locked: false,
    lockReason: null,
    ...rest,
  } as PinSeed;
}

/** Shorthands for the gated rungs, so fixtures read as intent not arithmetic. */
const FOLLOWERS: PinAccess = { privacy: "PRIVATE" };
const tier = (price: number): PinAccess => ({
  privacy: "TIER",
  subscriptionPrice: price,
  creatorTierPrices: MOCK_TIER_PRICES,
});

const B = Object.fromEntries(MOCK_BRANDS.map((b) => [b.id, b])) as Record<string, ArBrand>;

const PIN_SEEDS: PinSeed[] = [
  // ── Inside the 75 m AR radius ──────────────────────────────────────────
  seed({
    id: "pin-lumen-pourover",
    brand: B["brand-lumen"]!,
    title: "Free Pour-Over",
    description:
      "One single-origin pour-over, on us. Show the redeem code at the bar — it never expires once collected.",
    supply: 2_400,
    dist: 28,
    bearing: 42,
    detection: "qr",
    autoCollect: true,
  }),
  seed({
    id: "pin-museo-vantage",
    brand: B["brand-museo"]!,
    title: "Vantage — Oil on Linen",
    description:
      "Point your camera at the canvas in the east wing. The collectible carries the artist's notes and a 40-second recording of them describing the piece.",
    supply: 180,
    access: tier(50),
    dist: 54,
    bearing: 310,
    detection: "image",
  }),
  seed({
    id: "pin-market-lantern",
    brand: B["brand-nightmarket"]!,
    title: "Lantern Row Token",
    description:
      "Collected under the red lanterns on the south walk. Five of these in one night unlocks the mythic.",
    supply: 640,
    access: FOLLOWERS,
    dist: 66,
    bearing: 178,
    autoCollect: true,
  }),
  seed({
    id: "pin-relay-summit",
    brand: B["brand-relay"]!,
    title: "Summit Collectible — Ridge Climb",
    description: "You only get this one by actually riding up here. 8% average over 2.1 km.",
    supply: 42,
    access: tier(250),
    dist: 71,
    bearing: 95,
  }),

  // ── Just outside the radius — visible, not yet capturable ──────────────
  seed({
    id: "pin-halcyon-pressing",
    brand: B["brand-halcyon"]!,
    title: "First Pressing Reserve",
    description:
      "Holds a copy of this week's drop behind the counter for 24 hours from the moment you collect.",
    supply: 90,
    access: tier(50),
    dist: 118,
    bearing: 265,
    detection: "qr",
  }),
  seed({
    id: "pin-atlas-obelisk",
    brand: B["brand-atlas"]!,
    title: "The Obelisk",
    description:
      "Stop 4 of 17 on the Civic Trail. No signage permitted on the monument, so this one is pure image recognition — frame the whole obelisk and hold steady.",
    supply: 8,
    access: tier(1_000),
    dist: 143,
    bearing: 21,
    detection: "image",
    endsAt: null,
  }),
  seed({
    id: "pin-museo-kinetic",
    brand: B["brand-museo"]!,
    title: "Kinetic Study No. 6",
    description:
      "The moving sculpture in the atrium. Best collected when it's mid-cycle — the art changes depending on the pose it was in.",
    supply: 220,
    access: tier(50),
    dist: 186,
    bearing: 334,
    detection: "image",
  }),
  seed({
    id: "pin-lumen-beans",
    brand: B["brand-lumen"]!,
    title: "250 g Guest Roast",
    description:
      "A quarter kilo of whatever's on the guest hopper this week. Currently a washed Ethiopian.",
    supply: 300,
    access: FOLLOWERS,
    dist: 240,
    bearing: 128,
    detection: "qr",
  }),
  seed({
    id: "pin-market-mythic",
    brand: B["brand-nightmarket"]!,
    title: "Night Market Mythic",
    description:
      "Eight exist. Six are gone. Collected only by someone holding five Lantern Row tokens from the same night.",
    supply: 8,
    access: tier(1_000),
    dist: 310,
    bearing: 202,
    locked: true,
    remaining: 2,
    endsAt: iso(3),
  }),
  seed({
    id: "pin-relay-tuneup",
    brand: B["brand-relay"]!,
    title: "Workshop Tune-Up",
    description: "Full drivetrain service. Redeemable at the Eastside workshop, walk-ins welcome.",
    supply: 120,
    access: tier(50),
    dist: 420,
    bearing: 88,
    detection: "qr",
  }),
  seed({
    id: "pin-atlas-bridge",
    brand: B["brand-atlas"]!,
    title: "Iron Bridge, 1911",
    description: "Stop 9 of 17. Frame the eastern truss from the riverside path.",
    supply: 1_400,
    dist: 505,
    bearing: 156,
    detection: "image",
    endsAt: null,
  }),
  seed({
    id: "pin-halcyon-friday",
    brand: B["brand-halcyon"]!,
    title: "Loud Friday Entry",
    description: "Door entry for this Friday. One per person, obviously.",
    supply: 60,
    access: tier(50),
    dist: 560,
    bearing: 288,
    endsAt: iso(1),
  }),

  // ── Already collected (these populate the Collection screen) ───────────
  seed({
    id: "pin-museo-atrium",
    brand: B["brand-museo"]!,
    title: "Atrium Light Study",
    description:
      "The first piece in the collection, and still the one people ask about. Collected at dusk, which is the only time the atrium does this.",
    supply: 40,
    access: tier(250),
    dist: 96,
    bearing: 12,
    detection: "image",
    collected: true,
    collectedAt: iso(-22),
    redeemCode: "MSO-4KX2QH",
    isRedeemed: false,
    remaining: 3,
  }),
  seed({
    id: "pin-lumen-opening",
    brand: B["brand-lumen"]!,
    title: "Opening Week Collectible",
    description: "Issued for seven days only when the Downtown bar opened. Won't be minted again.",
    supply: 500,
    access: FOLLOWERS,
    dist: 210,
    bearing: 74,
    detection: "qr",
    collected: true,
    collectedAt: iso(-48),
    redeemCode: "LMN-9PT3RD",
    isRedeemed: true,
    remaining: 0,
    endsAt: iso(-41),
  }),
  seed({
    id: "pin-market-firstnight",
    brand: B["brand-nightmarket"]!,
    title: "First Night Token",
    description: "From the market's opening weekend. Sentimental more than useful.",
    supply: 2_000,
    dist: 380,
    bearing: 190,
    collected: true,
    collectedAt: iso(-60),
    redeemCode: "NMK-1ZB8WE",
    isRedeemed: true,
    remaining: 0,
  }),
  seed({
    id: "pin-atlas-fountain",
    brand: B["brand-atlas"]!,
    title: "Centenary Fountain",
    description: "Stop 1 of 17. Where the Civic Trail starts.",
    supply: 9_000,
    dist: 640,
    bearing: 350,
    detection: "image",
    collected: true,
    collectedAt: iso(-31),
    redeemCode: "ATL-6MQ0VC",
    isRedeemed: false,
    endsAt: null,
  }),
  seed({
    id: "pin-relay-bottle",
    brand: B["brand-relay"]!,
    title: "Relay Bidon",
    description: "600 ml, purple, slightly dented. Collected at the top of the ridge.",
    supply: 220,
    access: tier(50),
    dist: 700,
    bearing: 100,
    collected: true,
    collectedAt: iso(-12),
    redeemCode: "RLY-3HD7NA",
    isRedeemed: false,
  }),
  seed({
    id: "pin-halcyon-tape",
    brand: B["brand-halcyon"]!,
    title: "Halcyon Mixtape Vol. 3",
    description:
      "Ninety minutes, sequenced by the Thursday staff. The collectible links to the stream.",
    supply: 45,
    access: tier(250),
    dist: 820,
    bearing: 270,
    detection: "qr",
    collected: true,
    collectedAt: iso(-5),
    redeemCode: "HLC-8WR2LK",
    isRedeemed: false,
    remaining: 6,
  }),
];

/**
 * Scatter the whole mock drop around a real anchor. Called with the viewer's
 * GPS fix where one exists, and with FALLBACK_CENTER where it doesn't.
 */
export function projectPinsAround(center: Coords): ArPin[] {
  return PIN_SEEDS.map(({ dist, bearing, ...pin }) => {
    const { lat, lng } = offsetBy(center, dist, bearing);
    return { ...pin, lat, lng };
  });
}

export const MOCK_PINS: ArPin[] = projectPinsAround(FALLBACK_CENTER);

/** Rarity is derived, so the fixtures never state it and can't contradict it. */
export const rarityOf = (pin: ArPin) => pin.rarity;

export const DEFAULT_SETTINGS: ArSettings = {
  autoCollect: false,
  followingOnly: false,
  haptics: true,
  sound: true,
  compassMode: false,
};

/** Boot-sequence status lines. Ordered so the slowest-sounding one is last. */
export const BOOT_LINES = [
  "Waking the collector",
  "Calibrating compass",
  "Triangulating position",
  "Scanning for nearby drops",
  "Syncing your collection",
] as const;
