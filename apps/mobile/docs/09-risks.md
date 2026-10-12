# 09 · Risks, open questions, findings

## Found in the old repo (`wadzzoWebAR-public`)

- **A Mapbox secret download token (`sk.…`) is committed in its `app.json`.**
  The token in `production.json` is **the same token**. Decision
  (2026-09-26): the user keeps using it as-is. It lives in the git-ignored
  `.env` as `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (build-time only, never bundled)
  and must also be added to EAS for cloud builds, since EAS doesn't upload
  git-ignored files.
- Auth relied on NextAuth's session **cookie** being kept by React Native's
  native cookie jar. That's fragile (iOS/Android differ, no control over
  expiry). This project uses a Bearer token instead.
- It talked to `app.wadzzo.com/api/game/*`. Not used here.

## Risks

| Risk | Mitigation |
|---|---|
| ViroReact 3.0.1 is 5 days old | M0 go/no-go spike; 2.58.1 also supports Expo 57 as fallback. Pin exact version. |
| NativeWind vs RN 0.86 / React 19.2 | M0 spike; fallback typed theme + `StyleSheet`. |
| GPS drift makes AR coins wander | low-pass filter, max 0.5 m/frame, re-anchor on good fixes only (accuracy < 20 m) |
| Heading error indoors (compass) | show calibration hint when `watchHeadingAsync` accuracy is poor; web already has manual-look fallback |
| Mobile session = new auth surface | shared `authorize()`, rate limits, user-exists check per request |
| **Tokens never expire and can't be revoked** (accepted by user 2026-09-26) | a leaked token works until `MOBILE_JWT_SECRET` is rotated (which signs everyone out). Revisit if a device-loss case comes up. |
| Reusing the existing store listing | need the current Apple team + Android **upload key**; version ≥ 5.0.0; old users update in place, so first launch must handle having no old session (old cookie auth is not migrated — users sign in once). |
| Albedo on mobile is a browser round-trip | keep it as a secondary option; custodial sign-in is the main path |
| App Store review | Sign in with Apple (✓), account deletion (✓), location/camera purpose strings, no crypto trading features |

## Open questions

Answered: dev API = `http://localhost:3000`, prod URL to be set after
deployment (see the localhost caveat in 01-architecture) · uploads via S3 ·
env in `.env` + EAS secrets.

Answered 2026-09-26: reuse bundle id · no revocation, never expires ·
foreground-only auto-collect · no push in v1 · NativeWind · extras (gyro
foil, torch, camera attach) · skippable onboarding · full profile editing ·
in-app Mapbox directions · server and app in parallel.
