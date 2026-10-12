# 00 · Overview

Wadzzo AR, as a native iOS/Android app. Same product, same look and feel as
the **wadzzoAR** web app — rebuilt natively so AR runs on ARKit/ARCore through
ViroReact instead of a WebGL camera overlay.

This repo replaces `wadzzoWebAR-public` (the old Expo 50 app). That repo is
**reference only** — nothing is copied from it wholesale, and it is not a
dependency.

## What the app does

Brands drop digital collectibles ("pins") at real places. You find them on a
map, walk up to them, and capture them — in AR (a coin floating in the world
with a billboard beside it) or by scanning a printed QR code. Captures become
cards in your collection. Brands also post **bounties** (tasks with a reward)
that you can join and submit entries to.

## Locked decisions (2026-09-26)

| Topic | Decision |
|---|---|
| Access | **Browse freely signed out**, exactly like wadzzoAR. Sign-in is asked for only at the moment of an action: collect, follow, join/enter a bounty, chat, comment, profile. |
| Backend | **wadzzoAR is the server.** New REST endpoints under `/api/mobile/v1/*` on wadzzoAR, Bearer-token auth. The app never calls `app.wadzzo.com/api/game/*`. |
| Sign-in | Email + password (with register, email verification, forgot password), Google, Apple, Albedo wallet. |
| UI/UX | Same to same as wadzzoAR: palette, fonts, radii, motion, loading skeletons, boot sequence, celebration, tab bar with raised AR launcher, AR \| QR switch. |
| Map | Mapbox (`@rnmapbox/maps`), `light-v11` / `dark-v11` styles to match the web. |
| AR | ViroReact. Pins render as **spinning coins** with a **billboard** (info card) beside each. |
| Location | `/Volumes/Secondary Storage/Projects/wadzzoAR-mobile` |
| Store listing | **Reuse `com.thebillboardapp.wadzzo`** — ships as an update to the existing Wadzzo app. Version must be > the old app's **4.8.2** (start at **5.0.0**); needs the existing Apple/Google accounts and the Android upload key. |
| Sessions | Token **never expires**, **no server-side revocation** (user accepted the risk). Sign-out clears the phone only. Every authed request still checks the user row exists, so deleted accounts are rejected. |
| Styling | **NativeWind** (Tailwind classes ported from web). |
| Native extras | Gyro-tilt holo foil · torch in QR scanner · attach from camera in bounty entries. Nothing else beyond web parity. |
| First sign-in | Skippable "Make it yours" profile sheet. |
| Profile editing | Avatar, name, bio, cover (the web has none — new endpoint). |
| Auto-collect | Foreground only. |
| Push | Not in v1. In-app dots only. |
| Directions | In-app Mapbox route + "Open in Maps" fallback. |
| Build order | Server and app **in parallel**, milestone by milestone. |

## Version matrix (verified against npm 2026-09-26)

| Package | Version | Why |
|---|---|---|
| `expo` | **~57.0.25** | ViroReact 3.0.1 requires `expo >=57 <58` |
| `react-native` | **0.86.3** | Viro requires `0.86.x`. Expo 57 ships it. (RN 0.87 exists — **don't** take it.) |
| `react` | **19.2.3** | Viro requires `>=19` |
| `@reactvision/react-viro` | **3.0.1** (pin exact) | Current. Released 2026-09-21 — very new. Fallback: **2.58.1**, which also accepts Expo 57. |
| `@rnmapbox/maps` | 10.3.x | Mapbox SDK v11 |
| `expo-router` | ~57.0.x | file routes in `src/app/` |

Use `npx expo install <pkg>` for every dependency so versions stay SDK-aligned.

**Viro needs a development build.** It contains native AR code, so it never
runs in Expo Go. Build a dev client with EAS (`eas build --profile development`)
from milestone 0.

## Documents

| File | Covers |
|---|---|
| [01-architecture.md](01-architecture.md) | Stack, folders, data flow, state, env |
| [02-api.md](02-api.md) | The `/api/mobile/v1` contract on wadzzoAR, and how it's built |
| [03-auth.md](03-auth.md) | Every sign-in, register, reset and sign-out flow |
| [04-design-system.md](04-design-system.md) | Tokens, type, motion, components — web → native mapping |
| [05-screens.md](05-screens.md) | Every screen, its states and UX rules |
| [06-ar-qr.md](06-ar-qr.md) | Viro scene: coins, billboards, capture; QR scanner |
| [07-map.md](07-map.md) | Mapbox screen, markers, nearby rail, directions |
| [08-milestones.md](08-milestones.md) | Build order and acceptance criteria |
| [09-risks.md](09-risks.md) | Risks, open questions, things found in the old repo |
