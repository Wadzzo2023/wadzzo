# Map layers

A map layer groups a brand's drops by kind (Hospitals, Schools, Sports…) so fans can switch them on one at a time. Code comments that say `docs/layers` point here.

## The rules

- **Brands make their own layers**, from the layer switcher on their base map. There is no admin page.
- **Names are free.** One brand, or two different brands, can each have a "Hospital". A brand can have up to 30 layers (`MAX_LAYERS_PER_BRAND`).
- **One layer per pin, hotspot or trail, or none.** Something with no layer is *regular*.
  - A hotspot's drops are in the hotspot's layer, later ones included (the worker copies the hotspot's layer onto each drop). Changing a hotspot's layer moves all of its drops.
  - A trail is in a layer as a whole. Its new stops are made in that layer; changing the trail's layer moves the stops it made. Existing pins used as stops keep their own layer.
- **Deleting a layer** makes what was in it regular again (the foreign keys are `ON DELETE SET NULL`).
- **Fans see regular things by default.** The Layers button on the fan map's right-hand rail opens a sheet: **Regular drops** (on by default) and one row per brand layer with live drops nearby (its icon and name, the brand's name and logo, how many drops), each ticked on or off, with **Select all** / **Deselect all**. Several layers can be on at once; the map shows regular drops (if on) plus every layer that's on, pins and trail lines. When two layers share a name, the brand is added ("Hospital · Acme"). The button shows how many layers are on. The All / Following / … filter still applies. The map and the AR camera use the same choice. It isn't saved, so the map always opens on regular drops. The Trails list screen still lists every trail.
- **Map style.** The map's right-hand rail has a 2D / 3D button, between the compass and Layers (web and mobile). On the web the map type and terrain are under Map in Settings, which also has 2D / 3D (the trail and directions maps keep their own button); on mobile 2D / 3D is also under Map in Settings.

## Brand portal (Pins › Map)

- **The layer switcher** on the toolbar: **No layer** (the default, the regular map), the brand's layers (each with an edit button: name, icon, colour, delete), and **New layer**. A new layer is picked as soon as it's made.
- **The layer picked is the one the brand is in**: the map shows its pins, hotspots and trails, and everything made there goes in it: new pins, hotspots drawn, and new trails.
- **Eye buttons** (all off by default): each row, No layer included, has an eye to show that layer's drops too, so the brand can see several layers at once. New drops still go in the layer picked. The switcher shows "+N" for the others on.
- **Admins** (Admin › All maps): pick a brand, and the map is the brand's own Map acting for it: its pins, hotspots, trails and layers (create, edit, delete), floating cards that create for it (pins through the admin create, approved straight away), and trails built for it. Templates stay the signed-in brand's own, so they aren't offered there.
- **Forms open as floating cards** on the left of the map, like the trail builder, instead of going to a new page:
  - Click the map (or **New pin**, or a searched place's drop button): a new-pin card. While it's open, a map click moves the pin.
  - Draw a hotspot: a new-hotspot card. A hotspot template still opens its page.
  - **Edit** in a pin's or hotspot's details: an edit card. A map click moves a pin being edited.
  - A new-pin card starts from the last pin made in a card (all but its spot and layer), with **Clear** to start blank. This is kept for the session only.
  - The full pages (`/pins/new`, `/pins/[id]/edit`, `/pins/hotspots/new`, `/pins/hotspots/[id]/edit`) are still there and take `?layer=<id>`.
- **New forms take the layer from the switcher**, with no field to change it: a new pin, a new hotspot and a new trail go in the layer picked on top (changing the switcher while a card is open moves the new one too). A read-only note ("This pin goes in layer …") shows which, when one is picked. The full `/pins/new` and `/pins/hotspots/new` pages take it from `?layer=<id>`.
- **Edit forms keep a "Map layer" field** (shown once the brand has a layer), to move something to another layer: edit pin, edit hotspot, and the trail builder's Details tab for a saved trail. A hotspot's drop has no field; it follows its hotspot.
- The Pins list shows each pin's layer.

## Data

| Model | Field | Notes |
|---|---|---|
| `PinLayer` | id, platformId, creatorId, name, icon, color | Owned by a brand (`ON DELETE CASCADE` with the brand) |
| `LocationGroup` | `layerId` | Nullable. `ON DELETE SET NULL` |
| `Hotspot` | `layerId` | Nullable. `ON DELETE SET NULL`. Copied to each drop |
| `Trail` | `layerId` | Nullable. `ON DELETE SET NULL` |

Migration: `packages/db/prisma/sql/2026-11-11-pin-layers.sql`. It is additive and idempotent. Apply it **before** deploying the code.

## Where the code is

- Schemas: `packages/schemas/src/layer.ts` (icons, colours, `createLayerSchema`, `updateLayerSchema`, `layerIdInput`). `layerId` is on the hotspot, pin-edit and trail schemas.
- Brand API: `packages/api/src/brand/routers/maps/layer.ts` (`list`, `create`, `update`, `delete`). The pin, hotspot and trail procedures take `layerId`, checked by `checkLayer` (`packages/api/src/shared/layers.ts`): only the brand's own layers are allowed. Left out means "no change" on edits.
- Fan helpers: `packages/api/src/shared/layers.ts` (`layerFilterWhere`, `mapLayerChips`).
- Brand UI:
  - `apps/brand/src/features/pins/layers/`: the selected-layer store, the switcher, the layer dialog, the form field and `LayerTag`.
  - `apps/brand/src/ui/form-card.tsx` (card mode for `FormPage` and `FormSection`).
  - `features/pins/map-form-card.ts` (which card is open) and `features/pins/last-pin.ts`.
  - The base map (`features/pins/map-view.tsx`) wires them in.
- Fan web: `apps/ar/src/lib/ar/layers.ts` (`inLayer`, `trailInLayer`) and `components/map/LayerSheet.tsx`.
- Mobile: `apps/mobile/src/lib/ar/layers.ts` and `components/map/LayerSheet.tsx`. The mobile map draws only the trail being followed, so it doesn't filter trails.
- Icons are listed in three places that must match: `LAYER_ICONS` (schemas), `packages/ui/src/patterns/layer-icon.tsx`, and the mobile `layers.ts`. A test checks that they do.

## Fan API (backward compatible)

The App Store build must keep working, so the filter is opt-in:

- `GET /api/mobile/v1/pins` with no `layer` returns every pin, layer pins included, exactly as before. Each pin now also has an optional `layer: { id, name, icon, color } | null`.
- `?layer=none` returns regular pins only. `?layer=<chip id>` returns only that layer's pins.
- `GET /api/mobile/v1/layers?lat=&lng=&radiusKm=` returns the layers: `[{ id, name, icon, color, brand, brandImage, pinCount }]`, ordered by name and then brand (`brandImage`, the brand's logo, was added later).
- Trails (`/trails`, `/trails/:id`) gain an optional `layerId`. Nothing else changes, and every trail still comes back.

New mobile builds filter on the device, so they also work against an older server. There, every pin counts as regular, and a failed `/layers` request just means no chips. The website embed sends no `layer`, so it shows every pin.
