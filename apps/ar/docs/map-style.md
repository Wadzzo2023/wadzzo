# Wadzzo 3D map style

One basemap for every Wadzzo map — web (`src/lib/ar/theme.ts` → main map,
directions, embed, collection mini-map), the mobile app
(`wadzzoWebAR-public/src/theme/theme.ts`) and the brand portal
(`src/components/map-kit/base-map.tsx`).

| Theme | Studio style (account `wadzzo`) | URL |
|---|---|---|
| Dark | Wadzzo 3D Dark | `mapbox://styles/wadzzo/cmuwbonsf00rv01sdcun4fhdu` |
| Light | Wadzzo 3D Light | `mapbox://styles/wadzzo/cmuwc16ut00gz01sd6359b3sw` |

## What's in it

- **Base:** Mapbox Standard — real 3D buildings, landmarks, trees, sun /
  night lighting. Dark uses the `night` light preset, light uses `day`.
- **Colours:** Standard's *Custom* colour theme, a LUT generated from the
  arcade.css tokens by `scripts/map-theme/make-lut.cjs`. It keeps every
  colour's brightness (Mapbox's own ground / road / building / label
  contrast) and moves its hue onto Wadzzo's green neutrals; saturated blues
  become Wadzzo teal (water), greens become Wadzzo green (parks).
- **Buildings:** Standard's own buildings are off (`show3dBuildings: false`).
  Ours are two fill-extrusion layers from mapbox-streets-v8 (`slot: middle`):
  `wadzzo-walls` — walls textured with windows + floor slabs in four
  materials (concrete / brick / glass / plaster; sprite images `wz-m0…3`,
  picked per building by feature id) — and `wadzzo-roofs`, a 0.8 m cap in a
  matching roof colour. Buildings tagged with the 3 m OSM default are lifted
  to 7 m (~2 floors) so walls and windows read. Dark is **dusk** (lit
  windows, `emissive-strength` 1); light is a calm mint/stone/sage model.
  Made by `scripts/map-theme/` (`materials.mjs`, `patch-buildings.mjs`,
  `make-textures.mjs`).
- **POIs:** lower density, single muted sage colour — so our pins, murals
  and clusters stay the brightest things on the map.
- **SDK targets:** web and brand run mapbox-gl 3.32, mobile
  @rnmapbox/maps 10.3.5 → native 11.23.1. Don't go back below GL JS 3.32 /
  native 11.17: older Mapbox Standard ignores `show3dBuildings: false` and
  draws its plain boxes over our buildings.

## Changing the colours

1. Edit the `THEMES` block in `scripts/map-theme/make-lut.cjs`
   (`tint`, `water`, `park`, `contrast` per theme).
2. `node scripts/map-theme/make-lut.cjs` → `wadzzo-dark.png`, `wadzzo-light.png`.
3. In Studio open each style → *Mapbox Standard* import → *Color theme* →
   *Replace* with its PNG → check Dhaka / Savar at zoom 15–17, pitch 60 →
   *Publish*. No app change needed — the URLs stay the same.

## Changing the buildings

1. Colours / materials: `scripts/map-theme/materials.mjs`. Layer logic
   (heights, emissive, AO): `buildingLayers()` in `patch-buildings.mjs`.
2. `node scripts/map-theme/make-textures.mjs` → `textures/{dark,light}/wz-m0…3.svg`.
3. `node --env-file=.env.development scripts/map-theme/patch-buildings.mjs`
   → `wadzzo-3d-dark.json`, `wadzzo-3d-light.json` (built from the
   *published* styles, so re-running never stacks layers).
4. In Studio, per style: ⋮ → *Replace* with its JSON → *Reload* → **then**
   *Images* → *Upload images* with that theme's four SVGs (Replace resets
   the sprite, so upload after it) → check Savar at zoom 17.5, pitch 60 →
   *Publish*.

Keep the SVGs 42×24: Studio rasterizes them @2x (84×48, pixelRatio 2), and
patterns render at raster px ÷ pixelRatio, so a tile shows two ~3.5 m floors.
Keep `imports[].data` out of the uploaded JSON (the script strips it): the
API inlines the latest Standard there, and uploading it pins that version.

LUT format (Mapbox): 1024×32 PNG strip — 32 squares of 32×32; x = red,
y = green (down), square index = blue.
