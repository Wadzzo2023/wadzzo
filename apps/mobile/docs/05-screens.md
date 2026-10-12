# 05 · Screens

Every screen exists on the web; the web screen is the spec. Below: route, web
source, and what must hold on native. "🔒" = the action opens the AuthGate
when signed out; viewing never does.

## Navigation

```
(tabs)                      pushed (tab bar hidden)
 ├ Map         /map          ├ /ar         AR mode   ┐ AR | QR switch on top,
 ├ Cards       /collection   ├ /scan       QR mode   ┘ router.replace between them
 ├ [AR]  ──────────────────▶ ├ /collection/[id]
 ├ Bounty      /bounty       ├ /brands/[id]
 └ Brands      /brands       ├ /bounty/[id]
                             ├ /directions/[id]
 Avatar (top-right) ───────▶ ├ /profile
                             └ /auth/*  (sheet)
```

The AR tab button opens `/ar`; the tab stays lit on `/scan`. Profile is not a
tab (freed the slot for Bounty) — it's the avatar in every root header.

## Map — `/map` (web `pages/map.tsx`)
- Full-bleed Mapbox; GPS pill + filter chips (All · Following · Collectible ·
  Collected) across the top; avatar top-right.
- Right rail: recenter/refresh capsule, auto-collect ⚡ toggle 🔒, compass-map
  toggle. (No QR button — QR lives behind the AR tab.)
- Pins as **PinMarker** hex medallions (4 visual states). Tap → **PinSheet**.
- **NearbyStrip** rail above the tab bar; tapping flies the camera + opens the sheet.
- PinSheet primary action flips with proximity: inside 75 m **Capture** (→ `/ar?target=id`) 🔒, outside **Directions**.
- Auto-collect (setting on): claim eligible pins in range while the app is open and queue toasts. **Foreground only** (decided) — "While using" location permission.
- Location denied → **LocationGate** with per-platform steps and "Open Settings" (`Linking.openSettings()`).

## AR — `/ar` · QR — `/scan`
See 06-ar-qr.

## Collection — `/collection` (web `pages/collection/index.tsx`)
- Header "Your binder / Collection" + sort key (Newest · Rarest · Brand).
- Stats row: Cards · Brands · Best pull. Search.
- 2-col grid of HoloCards, infinite scroll (24/page). Signed out → pitch + Connect.

## Card — `/collection/[id]` (web `pages/collection/[id].tsx`)
- PackOpening on first view, then the card with gyro foil.
- Provenance (where, when, method), scarcity (serial / supply; omit denominator when uncapped), redeem code + QR, "View in AR".
- "View in AR" → Viro scene in single-pin mode (`/ar?pin=id`), range ignored.

## Bounty — `/bounty`, `/bounty/[id]`
Exactly the web design (Explore/Joined, Needs you, filter chips, cards; detail
with Brief · Mine · Chat · Talk, pinned state-machine CTA, composer in the
bottom bar on Chat/Talk, EntrySheet with per-file progress, winner confetti).
Native additions (approved): attach from **camera** directly, alongside the
library. `KeyboardAvoidingView` for composers.

## Brands — `/brands`, `/brands/[id]`
List with search + All/Following; detail with cover, identity, stats, Follow 🔒
(with phase labels: Preparing → Approve in wallet → Confirming), "On map",
Live drops / Your cards grids (24 per page).

## Directions — `/directions/[id]`
Mapbox route line (walking default; driving/cycling toggle) using Mapbox
Directions API, ETA per mode, "Open in Maps" (Apple/Google) as a fallback.

## Profile — `/profile`
Back button, balance (platform asset), identity (+ **Edit profile**: avatar,
cover, name, bio — approved native addition), totals, rarity breakdown,
latest pulls rail, settings (Auto-collect, Following only, Haptics, Sound,
Appearance), Sign out, **Delete account**. Signed out → the pitch screen with
"Connect".

## Auth — `/auth/*`
See 03-auth.

## Global states (every screen)
- **Loading**: skeletons shaped like the content.
- **Empty**: the web's exact copy.
- **Error**: inline danger panel with Retry; never a blank screen.
- **Offline**: a slim banner under the status bar; cached data stays visible (TanStack Query persistence).
- **Deep links**: `wadzzo://…` and universal links `https://<host>/scan?pin=`, `/collection/:id`, `/bounty/:id`, `/brands/:id` open the matching screen. A printed QR scanned with the phone camera opens the app and claims (web `/scan?pin=` behaviour).
