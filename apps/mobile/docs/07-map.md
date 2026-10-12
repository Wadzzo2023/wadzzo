# 07 · Map (Mapbox)

Library: `@rnmapbox/maps` 10.3.x (Mapbox Maps SDK v11). Config plugin in
`app.json` with `RNMapboxMapsVersion` pinned; download token from the EAS
secret `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (never committed). Public `pk.` token via
`EXPO_PUBLIC_MAPBOX_TOKEN` → `Mapbox.setAccessToken`.

## Styles
`mapbox://styles/mapbox/light-v11` / `dark-v11`, switched with the app theme —
identical to web `MAP_STYLE`.

## Camera
- Start: last known location → user fix, zoom 16, pitch 45 (as web).
- Follow mode on until the user pans; recenter button re-enables it.
- Compass-map mode: `followUserMode="compass"`; off → north up.

## Pins
- Markers are React views (`MarkerView`) rendering the ported **PinMarker**
  hex medallion — up to ~60 on screen. Beyond that, switch to a
  `ShapeSource` + `SymbolLayer` with clustering (cluster bubble in brand
  green, count in Chakra Petch) so the map stays at 60 fps.
- Four visual states (in range + claimable / out of range / collected /
  locked) exactly as web.
- Range ring (75 m capture radius) drawn as a `CircleLayer` around the user
  when a pin is selected.

## User puck
Custom **UserPuck** (web component) via `LocationPuck` replacement: pulsing
green dot + heading cone from `watchHeadingAsync`.

## Data
`GET /pins` (optional auth) cached by TanStack Query; refetch on focus, on
the refresh button, and when the user moves > 250 m. Filters are client-side
over that list (same `filterPins` as web).

## Directions
Mapbox Directions API (walking / cycling / driving), `LineLayer` route in
brand green with a darker casing, ETA per mode, step list in a sheet, and
"Open in Apple Maps / Google Maps" fallback.
