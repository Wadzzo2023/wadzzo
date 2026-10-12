# 01 · Architecture

## System

```
 ┌───────────────────────────┐        HTTPS, JSON         ┌──────────────────────────────┐
 │ wadzzoAR-mobile (Expo 57) │ ─────────────────────────▶ │ wadzzoAR (Next.js)           │
 │                           │  Authorization: Bearer …   │  /api/mobile/v1/*  (new)     │
 │  Viro AR · Mapbox · UI    │ ◀───────────────────────── │    └─ appRouter.createCaller │
 └────────────┬──────────────┘                            │  tRPC routers (existing)     │
              │ Firebase Auth (client SDK)                │  NextAuth authorize() logic  │
              ▼                                           └──────┬──────────┬────────────┘
       Firebase (register, verify email,                        │          │
       reset password, Google/Apple → ID token)          Postgres (Neon)  Stellar Horizon
                                                         shared w/ wadzz0  + accounts service
```

- **One source of business logic.** The REST layer on wadzzoAR does not
  re-implement anything. Each endpoint calls the existing tRPC procedure through
  `appRouter.createCaller(ctx)`, with a context built from the Bearer token.
  A fix to `pins.collect` fixes web and app together.
- **The app is a thin client.** No Prisma, no Stellar secrets, no Horizon
  calls from the device except signing flows that must happen client-side
  (Albedo).

## App stack

| Concern | Choice | Notes |
|---|---|---|
| Routing | Expo Router, `src/app/` | typed routes on |
| Server state | TanStack Query v5 | same cache semantics as web's react-query |
| Client state | Zustand (+ `persist` on MMKV or AsyncStorage) | mirrors web `useAuth`, `useSettings`, `useBountySeen` |
| HTTP | `fetch` wrapper `src/lib/api/client.ts` | adds Bearer, parses errors into `{ code, message }` |
| Validation | Zod | response schemas shared in `src/lib/api/schemas.ts` |
| Secure storage | `expo-secure-store` | the session token only |
| Styling | NativeWind (Tailwind for RN) | lets web class names port nearly 1:1. **Verify RN 0.86 support in M0**; fallback is a typed theme object + `StyleSheet`. |
| Motion | `react-native-reanimated` 4 + `react-native-gesture-handler` | replaces framer-motion |
| Drawing | `react-native-svg`, `@shopify/react-native-skia` | Skia for holo foil, confetti, scanlines, boot sequence |
| Blur / gradient | `expo-blur`, `expo-linear-gradient` | `.ar-glass`, fades |
| Fonts | `@expo-google-fonts/chakra-petch`, `/sora`, `/bungee-shade` | same three families as web |
| Map | `@rnmapbox/maps` | see 07-map |
| AR | `@reactvision/react-viro` 3.0.1 | see 06-ar-qr |
| QR | `expo-camera` `CameraView` barcode scanning | |
| Location / heading | `expo-location` (`watchPositionAsync`, `watchHeadingAsync`) | |
| Haptics / sound | `expo-haptics`, `expo-audio` | web `feedback.ts` equivalents |
| Images | `expo-image` | caching, blurhash placeholders |
| Uploads | `expo-image-picker`, `expo-document-picker` → presigned S3 PUT | same bucket and flow as web |
| Social sign-in | `@react-native-google-signin/google-signin`, `expo-apple-authentication` | |
| Wallet sign-in | `expo-web-browser` + deep link back | Albedo |
| Builds | EAS (development / preview / production profiles) | |

## Folder layout

```
src/
  app/                      # routes only (Expo Router)
    _layout.tsx             # providers, fonts, boot sequence overlay
    (tabs)/
      _layout.tsx           # custom tab bar with raised AR launcher
      map.tsx
      collection/index.tsx
      bounty/index.tsx
      brands/index.tsx
    ar.tsx                  # AR mode  ┐ one camera screen,
    scan.tsx                # QR mode  ┘ AR | QR switch on top
    collection/[id].tsx
    brands/[id].tsx
    bounty/[id].tsx
    directions/[id].tsx
    profile.tsx
    auth/
      sign-in.tsx
      register.tsx
      forgot-password.tsx
      albedo-callback.tsx
  components/               # mirrors wadzzoAR/src/components/* one-to-one
    shell/ ui/ map/ cards/ fx/ boot/ ar/ bounty/ brand/ auth/
  lib/
    api/                    # client, schemas, query hooks per resource
    auth/                   # session store, sign-in flows, firebase
    ar/                     # geo, rarity, feedback, theme, stores (ported from web lib/ar)
    viro/                   # coin + billboard nodes, GPS→scene math
  theme/                    # tokens.ts (generated from arcade.css), fonts.ts
```

Rule: **component and file names match wadzzoAR** (`HoloCard`, `PinSheet`,
`NearbyStrip`, `BottomTabBar`, `CollectCelebration`, …). Anyone who knows the
web app can find the native equivalent by name.

## Ported pure logic

These wadzzoAR files are platform-free and are copied, not rewritten:
`lib/ar/geo.ts`, `rarity.ts`, `projection.ts`, `heading.ts` (+ its tests),
`types.ts`, `bounty.ts` (display helpers), `entryFiles.ts`. Keep a comment at
the top of each naming the web source and commit it was taken from.

## Environment

`.env` (all `EXPO_PUBLIC_*` are embedded in the app bundle — nothing secret):

```
EXPO_PUBLIC_API_URL=http://localhost:3000   # dev (decided); swapped after wadzzoAR is deployed
EXPO_PUBLIC_MAPBOX_TOKEN=pk.…               # public token only
EXPO_PUBLIC_FIREBASE_API_KEY / _AUTH_DOMAIN / _PROJECT_ID / _STORAGE_BUCKET /
  _MESSAGING_SENDER_ID / _APP_ID            # project auth-29d94 — same as wadzzoAR
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=…         # from old Login.tsx (unlabelled there; used as Web ID by
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=…         #   decision — if M2 sign-in gives DEVELOPER_ERROR, it's the
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=…     #   wrong type; check Cloud Console project 443284916220)
```

`.env` is git-ignored; `.env.example` lists the names. Values came from
`~/Downloads/production.json` (renamed to the names above).
`UPLOADTHING_TOKEN` from that file is **not used** — uploads go through
wadzzoAR's presigned S3 (decided).

**localhost on a real phone:** testing is on a physical phone (AR needs one).
In dev builds, `src/lib/api/client.ts` rewrites a `localhost` API host to the
Mac's LAN IP taken from `Constants.expoConfig.hostUri` (the Metro server the
phone is already connected to), so `.env` keeps `http://localhost:3000`
unchanged. Phone and Mac must be on the same Wi-Fi. Production builds use the
URL as written.

The Mapbox **download** token (`sk.…`) is a build secret: EAS secret
`RNMAPBOX_MAPS_DOWNLOAD_TOKEN`, never in `app.json` or git.

Two environments, matching wadzzoAR's: **dev** (testnet, dev DB) and
**prod** (pubnet). Selected by EAS build profile.
