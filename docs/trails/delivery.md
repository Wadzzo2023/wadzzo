# Trails: delivery

[← Map Trails](./README.md)

## Module map

```
packages/
  db/prisma/schema.prisma                + Trail, TrailStop, TrailRun
  db/prisma/sql/2026-11-10-trails.sql    additive, safe to re-run
  schemas/src/trail.ts                   rules, limits, stop defaults, trailProgress()   + tests
  geo/src/trail-geometry.ts              length, bounds, sections, simplify,
                                         trailsToFeatures(), orderStops()                + tests
  api/src/brand/routers/maps/trail.ts    brand + admin procedures
  api/src/brand/server/trails.ts         save / validate / submit / approve
  api/src/brand/server/routing.ts        Mapbox Directions (server-side, cached)
  api/src/ar/routers/trails.ts           fan procedures
  api/src/ar/routers/pins.ts             + order lock in assertClaimable, + TrailRun update
  ar-core/src/ar/types.ts                + TrailSummary, TrailProgress
  ui/src/patterns/stop-badge.tsx         ①②③ badge
  ui/src/patterns/progress-steps.tsx     "3 of 4" bar
  agent-contract/src/index.ts            + TrailProposal                                 (phase 2)

apps/brand/src/
  components/map-kit/trail-layer.tsx     lines, arrows, hit area
  components/map-kit/pin-marker.tsx      + badge prop
  components/map-kit/pin-layer.tsx       + badges, pinned (never clustered)
  features/trails/trail-mode.tsx         panel + map toolbar (both maps)
  features/trails/use-trail-editor.ts    stops, order, sections, defaults, undo/redo
  features/trails/stop-list.tsx          drag to reorder
  features/trails/new-stop-form.tsx      the pin form, compact (reuses pin-form-parts + PinLookSection)
  features/trails/stop-defaults.tsx      look / type / collection / tier / template for new stops
  features/trails/trail-card.tsx         popup on a clicked line
  features/trails/trails-page.tsx        /trails list + stats
  features/admin/trail-review.tsx        approval queue
  features/pins/map-view.tsx             + Trails toggle, Trail button, layers
  features/admin/maps-page.tsx           + the same
  features/pins/new-pin-page.tsx         + ?trail= return to Trail mode after saving
  features/agent/cards/trail-card.tsx    proposal card                                   (phase 2)

apps/ar/src/components/trails/          list, page, follow mode, finish
apps/ar/src/components/ar/              + trail labels, locks, next-stop compass marker
apps/ar/src/components/map/             + TrailLayer, badges in NearbyStrip
apps/ar/src/app/api/mobile/v1/trails    new mobile routes (existing contracts unchanged)
apps/mobile/src/components/trails/      the same screens (@rnmapbox ShapeSource / LineLayer)
apps/mobile/src/components/ar/          + trail labels, locks
apps/express-wadzzo/src/agent/tools/    + propose_trail, list_trails, trail_report       (phase 2)
```

Each layer depends only on the ones below it (apps → api → schemas / geo → db), the same structure as the pin-look feature. `trailProgress()` and the geometry functions are pure, so they get unit tests like `point-cluster.ts`.

### As built (phases 1 + 2)

The module map above was the plan; this is what shipped where it differs:

- **Brand:** `features/trails/` holds `builder-store.ts` (zustand: draft, undo/redo), `trail-builder.tsx` (panel: Stops, Details, Stop style, Reward), `stop-dialogs.tsx` (New stop form, "Use the trail's style?"), `trail-lines.ts`, `trail-card.tsx`, `trail-thumb.tsx`, `trails-page.tsx`, `pin-trails.tsx` (the pin card's "On N trails"). The list is at **`/pins/trails`** (Drops › Trails); review at **`/admin/trails`** (Admin › Trail review). Trail mode lives in `features/pins/map-view.tsx` (`?trail=new|<id>` opens it).
- **Pin type is not a stop default:** `createPin` doesn't take a type, so new stops are regular pins.
- **The reward** is a hidden reward drop (`Trail.rewardGroupId`), claimed with `trails.claimReward` (see [data](./data-and-api.md)).
- **AR web:** `lib/ar/trails.ts` (follow state), `components/trails/` (TrailMapLayer, TrailFollowBar, TrailShape, TrailCard), `app/(shell)/trails` (list, trail page). Auto-collect skips stops that are still locked.
- **Mobile:** `src/app/trails` (list, trail page), `src/components/trails` (TrailMapLine, TrailFollowBar, TrailShape, TrailCard), `src/lib/ar/trails.ts`; the map's Trails shortcut sits under Events. Routes in `apps/mobile/docs/02-api.md`.
- **Agent:** `apps/express-wadzzo/src/agent/tools/trails.ts` (`list_trails`, `trail_report`, `propose_trail`, `propose_trail_changes`); actions `create_trail` / `update_trail` in `@wadzzo/agent-contract`, applied by `brand/server/agent/actions.ts` as drafts.
- **Admin map** (`features/admin/maps-page.tsx`) shows the chosen brand's trails and their cards; trails are built on the brand map (an admin switching to the brand gets the same Trail mode). Review is at `/admin/trails`.
- **Not yet:** labels and locks inside the AR camera scene (the server already refuses a locked stop with "Collect stop N first"), trail templates.

## Phases

| Phase         | Scope                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **1 · MVP**   | Build, approve and follow trails; New stop form; progress, order lock, map layer, AR labels. Brand, admin, AR web, mobile. |
| **2**         | Finishing reward, AI agent tools, ✦ Assist, trail stats, trail templates                                                   |
| **3 · later** | Record a path by walking, elevation, offline trails, GPX import                                                            |

### Phase 1, step by step

Each step can be reviewed and merged on its own.

| #   | Step                                                     | Done when                                                                                                             |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Database + migration                                     | Tables exist; `prisma db push` shows no changes after the SQL runs                                                    |
| 2   | Rules + geometry (schemas, geo)                          | `trailProgress`, validation and `trailsToFeatures` pass unit tests                                                    |
| 3   | Brand/admin API + routing                                | A trail can be saved, submitted, approved and rejected, with tests                                                    |
| 4   | `TrailLayer` + badges on the brand map                   | Saved trails draw on the brand and admin maps; clicking a line opens the card                                         |
| 5   | Trail mode: panel, toolbar, New stop form, stop defaults | A brand builds a 4-stop trail, including new stops with a chosen shape, without leaving the map, on desktop and phone |
| 6   | `/trails` page + admin review queue                      | DRAFT → PENDING → LIVE works in the portal                                                                            |
| 7   | Fan API + order lock in `assertClaimable`                | Collecting out of order is refused with a clear reason; progress is correct                                           |
| 8   | AR web: list, page, follow mode, AR labels, finish       | A fan completes a trail end to end on the AR site                                                                     |
| 9   | Mobile: the same screens                                 | Same on iOS and Android                                                                                               |
| 10  | Polish + QA                                              | Every edge case below has been checked                                                                                |

Before step 5, a quick **proof of concept** is recommended: one hard-coded trail drawn with `TrailLayer` on the brand map, so the look (line width, colours, badges) is agreed before the builder is built.

## Edge cases

| Situation                                             | Behaviour                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| A stop's pin is **deleted**                           | The stop is removed (cascade); the brand sees "Stop removed. Fix the path?" Progress is recomputed; completed rewards are kept. |
| A stop's pin **expires or runs out**                  | The brand is warned. Fans see "Stop 3 is no longer collectible", and it stops counting as required.                             |
| A pin is **hidden** by an admin                       | Same as expired; a live trail goes back to review.                                                                              |
| A brand **reorders a live trail**                     | Goes through review; fans keep their collects; locks recompute.                                                                 |
| A **multiPin** group as a stop                        | Done when _any_ of its locations is collected; the line goes to the location nearest the previous stop.                         |
| A locked **auto-collect** stop                        | Not collected on arrival; the app shows "Collect stop 2 first"; the auto loop skips it.                                         |
| **QR** collect on a locked stop                       | Refused by the same `assertClaimable` lock, with the same reason.                                                               |
| A New stop is **cancelled**                           | Nothing is created. Pins are created only on "Add stop".                                                                        |
| The brand **leaves the full pin form** without saving | The trail draft is kept; no stop is added.                                                                                      |
| **Routing fails**                                     | That section becomes straight, with a notice; saving never fails because of routing.                                            |
| **Routing cost**                                      | Only while building, one call per changed section, cached; fans never trigger routing.                                          |
| **Reward runs out**                                   | The trail stays playable; "Rewards all claimed". Stock is checked inside the transaction.                                       |
| **Long trails**                                       | Max 25 stops (recommended); the line is simplified for display, and the full version kept.                                      |
| **Two editors** at once                               | `updatedAt` check: "changed since you opened it".                                                                               |
| **White-label platforms**                             | `platformId` on every table.                                                                                                    |

## Open questions

1. **Order:** should brands choose In order / Any order per trail, or is one mode enough?
2. **Reward:** is there a reward for finishing? An asset/NFT, a discount code or a badge? All stops, or "N of M"?
3. **Stops:** only regular pins, or hotspot drops too?
4. **Path:** must the line follow real roads and footpaths, or are straight lines acceptable?
5. **Approval:** do trails need admin approval like pins?
6. **Admins:** does "admin from the brand" mean platform admins (all brands) or the brand's own team?
7. **Activities:** walking only, or cycling and driving too?
8. **Locked stops:** in an In-order trail, uncollectable, or collectable but not counted?
9. **Collect method:** should a trail be able to require AR capture (no auto-collect)?

### Decided

- **New stops:** a short form opens for each new stop, pre-filled from the trail's Stop defaults; the brand types a title and can change anything for that one stop.
- **Existing pins:** when one is added and its look differs, the brand is asked "Use the trail's style?". Yes changes the pin's look everywhere; No keeps it and adds only the number badge.
