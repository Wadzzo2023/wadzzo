# Wadzzo AR — mobile

Native iOS/Android app for Wadzzo AR: find brand drops on a map, capture them
as spinning AR coins (with billboards) or by QR, collect cards, and take part
in bounties. Same UI and UX as the **wadzzoAR** web app; wadzzoAR is also the
server (`/api/mobile/v1`).

**Stack:** Expo SDK 57 · React Native 0.86 · React 19.2 · ViroReact 3.0.1 ·
Mapbox (`@rnmapbox/maps`) · Expo Router · TanStack Query · Reanimated 4.

**Status:** planning. Start with [docs/00-overview.md](docs/00-overview.md).

| Doc | |
|---|---|
| [00-overview](docs/00-overview.md) | product, locked decisions, version matrix |
| [01-architecture](docs/01-architecture.md) | stack, folders, env |
| [02-api](docs/02-api.md) | `/api/mobile/v1` contract (built in wadzzoAR) |
| [03-auth](docs/03-auth.md) | sign-in, register, reset, Google, Apple, Albedo |
| [04-design-system](docs/04-design-system.md) | tokens, type, motion, components |
| [05-screens](docs/05-screens.md) | every screen and its states |
| [06-ar-qr](docs/06-ar-qr.md) | Viro coins + billboards, capture, QR |
| [07-map](docs/07-map.md) | Mapbox |
| [08-milestones](docs/08-milestones.md) | build order |
| [09-risks](docs/09-risks.md) | risks, open questions |

## Running

Viro needs native code, so **Expo Go won't work** — use a development build:

```bash
npm install
npx eas-cli@latest build --profile development --platform ios   # or android
npx expo start --dev-client
```
