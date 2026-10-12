# 08 · Milestones

Each milestone ends with something runnable on a real phone (dev client) and a
parity review against the web. **Server (wadzzoAR) and app are built in
parallel** (decided): within a milestone, each screen is wired to real data as
soon as its endpoint lands — no separate mock-data phase.

## M0 — Foundations
**App**
- [ ] Install core deps with `npx expo install` (router, reanimated, gesture-handler, svg, skia, blur, linear-gradient, image, secure-store, location, camera, haptics, audio, fonts, TanStack Query, Zustand, Zod).
- [ ] Install `@reactvision/react-viro@3.0.1` (exact) + `@rnmapbox/maps`; config plugins in `app.json`.
- [ ] EAS project + `development` profile; first **dev client** build on iOS and Android.
- [ ] Spike: a Viro scene with one spinning textured coin + billboard renders on both platforms. **Go/no-go for Viro 3.0.1** — if it fails, drop to 2.58.1 and log why.
- [ ] Spike: NativeWind on RN 0.86 (go/no-go; fallback theme object).
- [ ] Mapbox renders light/dark styles.
- [ ] `sync-tokens` script + fonts loaded + theme provider.

**Done when:** dev client on two devices shows a themed screen, a Mapbox map, and a Viro coin.

## M1 — Server: mobile API on wadzzoAR
- [ ] Extract `authorize()`; `POST/GET/DELETE /auth/session|me`; non-expiring JWT, user-exists check per request (no schema change).
- [ ] Catch-all route, route table, error mapping, rate limits.
- [ ] Read endpoints: pins, brands, bounties, comments, profile, balance.
- [ ] Contract tests for every endpoint.

**Done when:** a script can sign in with each credential type against the dev server and read every resource.

## M2 — Shell, design system, auth
- [ ] BottomTabBar (raised AR launcher), ScreenHeader, ProfileButton, BottomSheet, ArButton family, Skeletons, SegmentedTabs, Chips, badges.
- [ ] BootSequence (replaces splash).
- [ ] AuthGate + sign-in, register, verify-email, forgot-password, Google, Apple, Albedo; SecureStore session; first-sign-in profile sheet.

**Done when:** a new user can register → verify → sign in; each social/wallet method works on dev; screenshots match web.

## M3 — Map
- [ ] Mapbox screen, PinMarker, clustering, UserPuck, filters, NearbyStrip, PinSheet, LocationGate, recenter/compass.
- [ ] Directions screen.

## M4 — Collection & cards
- [ ] Collection grid, search, sort, infinite scroll.
- [ ] Card detail, HoloCard (gyro foil), PackOpening, redeem QR.

## M5 — AR & QR
- [ ] Permission gate, Viro scene, GPS placement, coins, billboards, HUD (reticle, radar, compass, edge arrows).
- [ ] Capture → server collect → CollectCelebration → card.
- [ ] QR scanner, AR | QR switch, deep link `/scan?pin=`.
- [ ] Field test: 3 real pins outdoors on iOS + Android.

## M6 — Brands & follow
- [ ] Brands list/detail; follow with server-side submit (custodial) and Albedo `tx` signing.
- [ ] **Server:** follow submit, `brands.byId`.

## M7 — Bounty
- [ ] All bounty screens and flows, uploads (camera + library), chat, discussion, Needs-you dot.
- [ ] **Server:** bounty write endpoints + uploads.

## M8 — Profile, polish, release
- [ ] Profile, **edit profile** (avatar, cover, name, bio + uploads), settings, appearance, haptics/sound, sign out, **delete account**.
- [ ] **Server:** `GET/PATCH /me/profile`, `DELETE /me`.
- [ ] Offline banner + query persistence, deep/universal links.
- [ ] Accessibility pass (VoiceOver/TalkBack labels, 44 pt targets, reduced motion).
- [ ] App icons, store screenshots, privacy manifest, permission strings, TestFlight + internal testing track — on the **existing** `com.thebillboardapp.wadzzo` listings, version 5.0.0.
