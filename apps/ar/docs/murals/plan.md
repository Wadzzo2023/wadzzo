# Murals — plan

Status: **approved plan, not started** (2026-10-04). Every decision below was
made by the user; §12 records the last round. Anything new must be asked, not
assumed.

Repos touched (built in parallel once §4–§5 are agreed):

| Repo | Role |
|---|---|
| `wadzzoAR` | Schema owner, tRPC `murals` + `coins` routers, REST mirrors for mobile, web Murals camera, map pins, collection, embed |
| `the brand portal` | Admin › Mural review + Mural settings |
| `wadzzoWebAR-public` | Mobile Murals camera, map pins, collection |

---

## 1. What it is

Users find street art (murals **and graffiti**) anywhere, point the camera at
it, do a short left/right sweep, and earn **Wadzzo Coins**. Brands are not
involved. Murals live on maps and in the Murals camera only — **not** in the AR
view.

- The first valid scan of a piece **creates** the mural. It is collectable
  immediately.
- Once **3 distinct users** have scanned it, it enters the admin queue.
- Admin **approves** (it becomes a full pin on every map) or **rejects** (no
  longer collectable).
- Every valid scan earns coins — before and after approval.
- The **first 3 distinct scanners** also earn a discovery bonus.
- Per user, per mural: **X scans per day** (local midnight). Different murals
  are unlimited.
- Coins are an off-chain balance. Redeeming is out of scope; we only show it.

## 2. Lifecycle

```
            first valid scan
                  │
                  ▼
   ┌──────────────────────────┐   3rd distinct scanner   ┌──────────┐
   │ DISCOVERED (1–2 scanners)│ ───────────────────────► │ PENDING  │ ← admin queue
   └──────────────────────────┘                          └────┬─────┘
          collectable, faint "unverified" pin                 │
                                              approve ┌───────┴───────┐ reject
                                                      ▼               ▼
                                                ┌──────────┐   ┌──────────────────────┐
                                                │ APPROVED │   │ REJECTED             │
                                                └──────────┘   │  NOT_A_MURAL → keep  │
                                                full pin on    │  FRAUD → revoke coins│
                                                every map      └──────────────────────┘
                                                               not collectable, hidden
```

Admin can also move APPROVED/REJECTED back to PENDING (same as pin review's
"move back"), and **merge** two records that turned out to be the same mural.

## 3. Detection pipeline

Two tiers. The phone does everything continuous, for free; the server decides
once per completed sweep.

### 3.1 On device (free, real time)

- **Model:** MobileCLIP image encoder, ONNX, quantized. The *same* weights on
  web (Transformers.js, WebGPU → WASM fallback) and mobile
  (`onnxruntime-react-native`), so embeddings are comparable everywhere.
- **Text side is precomputed.** We ship the prompt embeddings as a JSON file;
  devices only run the image encoder.
  - Positive: "a mural painted on a wall", "street art", "graffiti on a wall",
    "a graffiti tag", "a painted building facade".
  - Negative: "a laptop screen", "a computer monitor", "a phone screen",
    "a television", "a printed poster", "a person", "a plain wall",
    "a car", "a room interior", "a billboard advertisement".
- **Loop:** sample 3–5 fps → 224×224 → encode → softmax over prompts →
  `muralScore`. Smooth: lock when 4 of the last 5 frames score ≥ threshold.
  Unlock (with a short hysteresis) when it drops.
- **Cheap frame checks** alongside: brightness (too dark), Laplacian variance
  (blurry), gyro rate (moving too fast).
- **Client pre-match:** the nearby query (§5) returns the reference embeddings
  of murals within ~150 m. On lock, the device compares locally, so the UI can
  say "This is *Blue Heron* · 1 of 3 scans left today" *before* the sweep, and
  can stop a scan that would hit the daily limit without any server cost.
  The server never trusts this; it recomputes (§3.3).

### 3.2 The sweep (anti-spoof + "full mural")

After lock: **turn left ~15° → turn right ~15° → back to centre.** The
device captures one keyframe at each of the three positions (1024 px long
edge, JPEG ~80%) and records the gyro yaw trace. Requirements, checked on
device and again on the server:

- total yaw span ≥ 20°, sweep took 1.5–20 s;
- `muralScore` stayed above a lower threshold through the sweep (mural kept in
  view);
- frames are live camera captures (no gallery upload path exists).

### 3.3 On the server (once per sweep, in this order — cheapest first)

| # | Check | Cost | Rejects |
|---|---|---|---|
| 1 | Scan session valid: owned, unused, < 3 min old; GPS accuracy ≤ 50 m; mobile mock-location flag false | $0 | stale/replayed sessions, bad GPS |
| 2 | Sweep trace sane (span, duration) | $0 | no real movement |
| 3 | **Server-side embeddings** of the 3 keyframes (same MobileCLIP) + zero-shot score | $0 | obvious non-art |
| 4 | Match: non-merged murals within 75 m, max cosine ≥ threshold → existing mural, else new | $0 | — |
| 5 | Matched mural REJECTED → stop; daily limit reached → stop | $0 | limit / rejected |
| 6 | Cloud Vision **LABEL + SAFE_SEARCH** on the centre frame | ~$0.0015 | not street art; unsafe |
| 7 | Cloud Vision **OBJECT_LOCALIZATION** on all 3 frames (Laptop, Computer monitor, Television, Mobile phone, Tablet computer with box area above a threshold) + **WEB_DETECTION** on the centre frame (full matching images online) | ~$0.017 | screens; photos of photos |
| 8 | Transaction: create/lock mural, write scan, ledger, counters, status change | $0 | — |

Step 3 is what makes dedup trustworthy: a client can't claim "new mural" with
a made-up embedding to farm discovery bonuses at the same wall.

> **M0 result:** fits Vercel. Only the Linux x64 onnxruntime build is traced
> into the two API functions that need it (`next.config.js`), ~132 MB total
> locally, under the 250 MB limit. The fp16 weights are fetched into /tmp on a
> cold start.

### 3.4 Daily limit and "local midnight"

The server derives the time zone from the scan's GPS (`tz-lookup`, offline,
small), not from the device, so changing the phone's time zone buys nothing.
Each scan stores `localDay` (`YYYY-MM-DD` in that zone); the limit is
`count(scans where user, mural, localDay) < dailyScansPerMural`.

### 3.5 Cost

Valid mural scan ≈ **$0.02**. Rejected at step ≤ 5 = **$0**. Rejected at 6 ≈
$0.0015. First 1,000 units/month free. Signed-out viewers can't reach step 1.

## 4. Data model

Edited identically in `wadzzoAR/prisma/schema.prisma` and
`the brand portal/prisma/schema.prisma`. **The user runs `prisma db push`.**

```prisma
enum MuralStatus {
  DISCOVERED // 1 .. confirmationsNeeded-1 distinct scanners
  PENDING    // in the admin queue
  APPROVED
  REJECTED
}

enum MuralRejectReason {
  NOT_A_MURAL // users keep coins
  FRAUD       // coins earned from it are revoked
}

enum CoinReason {
  MURAL_SCAN
  MURAL_DISCOVERY
  MURAL_REVOKE
  ADMIN_ADJUST
}

model Mural {
  id        String  @id @default(cuid())
  autoTitle String  // "Mural on Bedford Ave" (Mapbox reverse geocode)
  title     String?
  artist    String?
  latitude  Float
  longitude Float
  coverUrl  String  // best keyframe; admin can change

  status       MuralStatus        @default(DISCOVERED)
  rejectReason MuralRejectReason?
  decidedAt    DateTime?
  decidedById  String?

  distinctScanners Int @default(0)
  scanCount        Int @default(0)

  discovererId String
  discoverer   User   @relation("MuralDiscoverer", fields: [discovererId], references: [id])

  mergedIntoId String?
  mergedInto   Mural?  @relation("MuralMerge", fields: [mergedIntoId], references: [id])
  mergedFrom   Mural[] @relation("MuralMerge")

  embeddings MuralEmbedding[]
  scans      MuralScan[]
  ledger     CoinLedger[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([latitude, longitude])
}

// Reference embeddings: from accepted scans, capped (~12) and spread across
// angles so matching improves as more people scan.
model MuralEmbedding {
  id        String  @id @default(cuid())
  muralId   String
  mural     Mural   @relation(fields: [muralId], references: [id], onDelete: Cascade)
  vector    Float[]
  scanId    String?
  createdAt DateTime @default(now())

  @@index([muralId])
}

model MuralScan {
  id      String @id @default(cuid())
  muralId String
  mural   Mural  @relation(fields: [muralId], references: [id], onDelete: Cascade)
  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  latitude  Float
  longitude Float
  accuracyM Float
  timeZone  String
  localDay  String   // YYYY-MM-DD in timeZone
  keyframes String[] // S3 URLs: left, centre, right
  vision    Json     // labels, safe-search, objects, web matches, scores
  platform  String   // "web" | "ios" | "android"

  discoveryRank Int? // 1..confirmationsNeeded for the first distinct scanners
  coinsAwarded  Int

  createdAt DateTime @default(now())

  @@index([userId, muralId, localDay])
  @@index([muralId])
}

// Every attempt, accepted or not: rate limiting, abuse review, and training
// data for a custom classifier later.
model MuralScanSession {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  outcome    String?   // "accepted" | reject code (§6.6)
  scanId     String?   @unique
  costUnits  Int       @default(0) // Cloud Vision units spent

  @@index([userId, startedAt])
}

model CoinBalance {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  balance   Int      @default(0)
  updatedAt DateTime @updatedAt
}

model CoinLedger {
  id        String     @id @default(cuid())
  userId    String
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  amount    Int        // negative for revokes
  reason    CoinReason
  muralId   String?
  mural     Mural?     @relation(fields: [muralId], references: [id], onDelete: SetNull)
  scanId    String?
  note      String?
  createdAt DateTime   @default(now())

  @@index([userId, createdAt])
  @@index([muralId])
}

// Single row (id = 1). Admin › Mural settings.
model MuralSettings {
  id                  Int      @id @default(1)
  coinsPerScan        Int      @default(10)
  discoveryBonus      Int      @default(50)
  dailyScansPerMural  Int      @default(3)
  confirmationsNeeded Int      @default(3)
  updatedAt           DateTime @updatedAt
  updatedById         String?
}
```

Plus back-relations on `User`, and on `MapEmbed`: `showMurals Boolean
@default(true)`.

Concurrency: the scan transaction takes `SELECT … FOR UPDATE` on the mural row
so two simultaneous scanners can't both be "#3" or both get a bonus. New-mural
creation takes a Postgres advisory lock on a ~100 m geohash cell so two people
discovering the same wall at the same moment don't create twins (admin merge
covers what slips through).

## 5. API

### 5.1 the AR app tRPC (`murals`, `coins`) + REST mirrors for mobile

| tRPC | REST (`/api/mobile/v1`) | Auth | Purpose |
|---|---|---|---|
| `murals.inArea({bounds})` | `GET /murals?n&s&e&w` | none | Map + embed pins (APPROVED + unverified, never REJECTED/merged) |
| `murals.nearby({lat,lng})` | `GET /murals/nearby` | optional | Camera: murals ≤ 150 m with reference embeddings + viewer's scans today |
| `murals.byId({id})` | `GET /murals/:id` | optional | Mural sheet / detail |
| `murals.startScan({lat,lng,accuracy})` | `POST /murals/scans` | required | Creates session, returns 3 presigned S3 PUT URLs + current limits |
| `murals.submitScan({sessionId, frames, sweep, gps, platform, mock?})` | `POST /murals/scans/:id/submit` | required | Runs §3.3, returns `ScanResult` |
| `murals.name({id,title,artist})` | `PATCH /murals/:id` | required | Any of the first 3 scanners; first to fill it wins (title/artist must be empty); admin can edit anytime |
| `murals.mine({cursor})` | `GET /me/murals` | required | Collection → Murals |
| `coins.balance()` | `GET /me/coins` | required | Balance |
| `coins.history({cursor})` | `GET /me/coins/history` | required | Ledger list |

`ScanResult` is a discriminated union the UI renders directly:

```ts
type ScanResult =
  | { kind: "collected"; mural: MuralCard; coins: number; scansToday: number; dailyLimit: number }
  | { kind: "discovered"; mural: MuralCard; coins: number; bonus: number; rank: 1 | 2 | 3; confirmations: number; needed: number; canName: boolean }
  | { kind: "rejected"; code: RejectCode; message: string; retryable: boolean };
```

Rate limits: `startScan` ≤ 30/hour/user; submissions ≤ 20/day/user that reach
Cloud Vision (protects cost from a single account).

### 5.2 the brand portal (admin only)

`admin.murals.list({status, sort, filters})`, `byId`, `decide({ids, status,
reason?})`, `edit({id, title, artist, coverUrl})`, `merge({fromId, intoId})`,
`settings.get`, `settings.update`. Revoke on FRAUD writes one negative ledger
row per affected user in the same transaction and reports the totals back for
the confirm dialog. Revokes **floor at 0**: a user is charged
`min(earnedFromMural, currentBalance)`; the ledger note records any shortfall.

## 6. UX — camera (web + mobile, identical)

Accent: `--rarity-epic` (the Murals tile's colour already). Every state below
has one line of guidance text, one visual, and a haptic on mobile.

### 6.1 Entry
- Camera launcher → **Murals** tile (drop the "Soon" badge, `href: "/murals"`).
- Map mural sheet → **Scan this mural** (opens camera pre-targeted at it).
- `CameraModeSwitch` grows to **AR | QR | Murals**.

### 6.2 Gate
Reuse the existing permission gate: camera, location, motion (iOS
`DeviceOrientationEvent.requestPermission`). Location is **required** here
(unlike AR) — the denied state explains why ("Murals are tied to where they
are painted").

### 6.3 First-run model load
One-time download card: progress ring, "Getting the mural finder ready ·
~N MB · only once". Cached (Cache Storage on web, app files on mobile). Camera
preview already runs behind it so the screen isn't empty.

### 6.4 Live states (viewfinder overlay)

| State | Visual | Text |
|---|---|---|
| Searching | Four corner brackets, slow breathing; faint shimmer | "Point at a mural or street art" |
| Too dark / blurry / moving fast | Bracket colour dims, small icon chip | "Too dark" · "Hold steady" · "Slow down" |
| Something there (score rising) | Brackets tighten, fill-meter along bottom edge | "Hold it there…" |
| Locked | Brackets snap + glow, haptic | "Mural found" or, if pre-matched, "**Blue Heron** · 2 scans left today" |
| Locked but limit hit | Grey lock chip | "You've scanned this 3/3 today — back after midnight" (no sweep, no cost) |

Top chip, always visible: "2 murals nearby" (tap → small list with distance +
direction arrow; unverified ones say "Help verify").

### 6.5 Sweep
- Bottom: a horizontal arc gauge with a phone glyph riding on it, driven by
  live yaw. Three target ticks: left, centre, right.
- Step text: "Slowly turn left" → tick fills, shutter-blink, thumbnail drops
  into a 3-slot tray → "Now turn right" → "Back to centre".
- Mural lost mid-sweep: gauge pauses, "Keep the mural in view".
- Too fast: "A little slower" (keyframe would blur).
- Cancel (✕) anytime; nothing is sent until all three frames exist.

### 6.6 Verifying
Tray collapses into a card that flips while checking (~1–3 s). Three ticks
appear in order: **Street art ✓ · Right place ✓ · Not a screen ✓**.

### 6.7 Results
- **Collected:** coin burst "+10", mural card, "Scans today 2/3", balance
  ticker counts up. Buttons: **Done** · **View in collection**.
- **Discovered (#1):** bigger moment — "You discovered a new mural!", "+10 · +50
  discovery bonus", badge "Discoverer".
- **Confirmer (#2/#3):** "You helped verify this mural!", "+10 · +50 bonus",
  confirmation dots ●●○ / ●●● ("Sent for review").
- For #1–#3, if the mural has no title yet: the optional **Name this mural**
  sheet (title, artist, Skip). If someone else named it meanwhile, the sheet
  shows their name instead ("Named by @ana").
- **Rejected:** friendly, specific, with the next action:

| Code | Message | Action |
|---|---|---|
| `NOT_ART` | "That doesn't look like street art" | Try again |
| `SCREEN` | "Looks like a screen or photo — scan the real wall" | Try again |
| `WEB_COPY` | "This image matches a photo online — scan it in person" | Try again |
| `GPS_WEAK` | "Your location is too rough (±120 m) — step outside and wait a moment" | Retry |
| `NO_SWEEP` | "Turn the phone a bit further left and right" | Retry sweep |
| `DAILY_LIMIT` | "3/3 today — come back after midnight" | Done |
| `MURAL_REJECTED` | "This one isn't collectable" | Done |
| `UNSAFE` | "We can't accept this image" | Done |
| `RATE_LIMIT` | "Too many scans — take a short break" | Done |

### 6.8 Signed out
Detection works (free, on device). At **lock**, a sign-in sheet: "Sign in to
collect this mural". After sign-in the camera returns to searching (frames are
not kept).

## 7. UX — map (web, mobile, embed)

- **Mural pin = a third shape** in the existing marker language (round = tap,
  square = auto-collect): a portrait **frame** (4:5, rounded) showing the cover
  thumbnail, ringed in `--rarity-epic`.
  - Approved: 100%.
  - Unverified (DISCOVERED/PENDING): 60%, dashed ring, small "?" badge.
  - At your daily limit: 80% + gold tick.
- **Filter menu:** "Murals" toggle, with "Show unverified" under it.
- **Mural sheet:** the **cover photo only** (scan keyframes are never public —
  privacy), title/artist (or auto title), status chip, distance, total scans, your scans today x/X, coins you've
  earned here. Primary CTA **Scan this mural** when within ~100 m; otherwise
  "Get closer · 340 m" + **Directions**. Unverified: "Help verify — 2 of 3".
- **Embed:** approved murals only, **on by default** (`MapEmbed.showMurals
  @default(true)`), brands can switch it off in the embed editor; tap → preview
  → "Open in Wadzzo".
- **AR view:** murals are not shown (user decision).

## 8. UX — collection and coins

- `/collection` gets a segmented control at the top: **Drops | Murals**.
- Murals grid: 2-up cards (same budget as HoloCards, "lite" on mobile per GPU
  rules) with the user's own best keyframe, title, status chip, "Discoverer"
  badge if rank ≤ 3, coins earned there. Rejected-as-fraud murals disappear;
  rejected-not-a-mural stay, greyed, labelled "Not collectable".
- Mural detail: header photo, map snippet, your scan history (date + coins),
  status timeline (Discovered → Pending → Approved).
- **Wadzzo Coins:** a balance pill in the collection header and on the profile;
  tap → ledger list (scan, discovery bonus, revoked) with a muted **"Redeem
  coming soon"** note. No redeem button.
- Collection cards and mural detail show the **user's own** keyframes (they
  took them); other people's photos are never shown.

## 9. UX — admin (the brand portal)

Nav: Admin › **Mural review** (`/admin/murals`), with a **Settings** tab on
the same page (no separate nav item). Built on the pin-review pieces
(`features/admin/pin-review/*`: filter panel, preview sheet, shortcuts, undo
toasts).

- **Tabs:** Pending · Gathering (1–2 scanners) · Approved · Rejected.
- **Row:** cover, title/auto title, place, confirmations ●●●, total scans,
  first-3 avatars, flags:
  - ⚠ any scanner account < 7 days old,
  - ⚠ two of the first 3 scanned within 2 min of each other,
  - ⚠ Vision borderline (screen object found below threshold, low art score),
  - ⚠ possible duplicate within 50 m.
- **Preview sheet:** every scan's 3 keyframes (admin-only; pick any as the
  public cover), mini map with scan
  points, Vision scores, possible duplicates with **Merge into this**.
- **Actions:** Approve · Reject → dialog with the two reasons; FRAUD shows
  "Will revoke 340 coins from 7 users" before confirming · Edit title/artist/
  cover · Move back to pending. Keyboard shortcuts and undo like pin review.
- **Settings tab:** coins per scan, discovery bonus, scans per mural per day,
  confirmations needed. Shows "applies to new scans from now".

## 10. Mobile specifics (wadzzoWebAR-public)

- **As built:** VisionCamera 5.2.3 frame output (upright RGB via
  `enablePhysicalBufferRotation`) → worklet box-downsamples the centre square
  to 256² → `react-native-fast-tflite` 3.0.1 runs MobileCLIP S0 **TFLite fp16**
  (converted from the same ONNX with onnx2tf; cos ≥ 0.9998 vs ONNX, 73/73
  identical lock decisions; CoreML delegate on iOS, CPU fallback). Model is
  downloaded on first use from
  `https://wadzzo.s3.amazonaws.com/murals/models/mobileclip_s0_fp16_v1.tflite`.
  Keyframes via the photo output (~1024 px JPEG). `onnxruntime-react-native`
  was rejected: it installs via `RCTCxxBridge`, which RN 0.86 bridgeless lacks.
- The iOS UIScene fix is an `expo-build-properties` plugin now, so prebuilds
  are safe. Verified: `expo prebuild` + `pod install` + unsigned device build
  (`xcodebuild … CODE_SIGNING_ALLOWED=NO`) → **BUILD SUCCEEDED** (Xcode 27).
  Android not built yet.
- Murals screen is its own route (`/murals`); Viro and the camera never run at
  the same time (same rule as AR/QR).
- Mock location: Android `location.mocked`, iOS `isSimulatedBySoftware` → sent
  as `mock`, server rejects.
- Viro plane/distance check (wall ≥ 1.5 m away) is a **later** add-on; not v1.

## 11. Milestones (parallel after M1)

| | the AR app | the brand portal | wadzzoWebAR-public |
|---|---|---|---|
| **M0 spike** | MobileCLIP in browser (fps on iPhone/Android, model size); server-side embedding on Vercel vs task server; Cloud Vision on 30 sample photos incl. screens | — | vision-camera + ORT on RN 0.86 |
| **M1** | Schema (both repos), settings row, `murals`/`coins` routers, REST mirrors, S3 prefix `murals/` | schema copy | — |
| **M2** | Web camera (§6) | Mural review + settings (§9) | Camera (§6, §10) |
| **M3** | Map pins/sheet/filter, collection + coins (§7–8) | — | Map + collection + coins |
| **M4** | Embed toggle, cost/abuse dashboards from `MuralScanSession` | Embed editor toggle | — |
| **M5** | Threshold tuning on real scans; device testing on real murals | — | Device testing |

## 12. Decisions (final round, 2026-10-04)

1. UI name **Wadzzo Coins**; defaults **10 per scan / 50 discovery bonus / 3
   scans per mural per day / 3 confirmations**.
2. FRAUD revoke **floors at 0**.
3. **Any of the first 3** scanners can name a mural; first to fill it wins;
   admin can edit anytime.
4. Murals on **maps only**, not in the AR view.
5. Embeds show approved murals **by default**; brands can turn it off.
6. Publicly only the **cover photo**; all keyframes are admin-only; each user
   sees their own.
7. Balance shows a muted **"Redeem coming soon"**.

## 13. Progress log

**2026-10-04 — M0 spike**
- Model: **MobileCLIP S0 fp16 (22.9 MB)**. The int8/q8 build is broken (every
  image → "a person"); fp16 equals fp32 exactly.
- Accuracy on 73 Wikimedia photos at score ≥ 0.5: murals/graffiti 24/30,
  screens 0/16, other negatives 4/27 (plain brick facades, painted lettering).
  Misses are wide street shots where the mural is a strip — not how users aim.
  The "mural shown on a laptop" attack still needs real photos.
- Speed: Mac Chrome WebGPU 24–26 ms/frame (8 fps sustained), first load 7.3 s;
  headless WASM 133 ms/frame (4 fps sustained). Server Node 22–25 ms/frame.
- Phone test page: `/dev/mural-spike` (404 in production). Not yet run on a
  real phone.
- Mobile: vision-camera 5.2 (Nitro) peers on any RN; resize plugin is stale
  (2024, targets v4). Needs a real prebuild to confirm — not done (wipes the
  iOS AppDelegate fix; ask first).
- Cloud Vision: not tested yet (needs `GOOGLE_VISION_CREDENTIALS`).

**2026-10-04 — M1 (server) built, DB not pushed**
- Schema §4 added to both repos (the brand portal keeps 4-space/CRLF).
  **User runs `prisma db push`.**
- the AR app: `src/lib/murals/{constants.ts,prompts.s0.json}`,
  `src/server/murals/{clip,vision,geo,service,scan}.ts`, routers `murals` +
  `coins`, REST mirrors in `server/mobile/routes.ts`, S3 helpers
  `signMuralFrames` / `getObjectBytes`, env `GOOGLE_VISION_CREDENTIALS`
  (optional; Vision is skipped outside production without it).
- Deps: `@huggingface/transformers@4.3.0`, `google-auth-library`,
  `@photostructure/tz-lookup`; `onnxruntime-node` build script denied in
  `pnpm-workspace.yaml` (CPU binaries ship in the package). Side effect: sharp
  0.34.1 → 0.35.5 (plaiceholder); `next build` passes.

**2026-10-04 — M2 web camera + admin built, DB not pushed**
- the AR app `/murals`: permission gate (shared `ArPermissionGate`, now with
  per-mode `copy`), live MobileCLIP detector (`useMuralDetector`, WebGPU →
  WASM, 4 fps, lock 4/5 ≥ 0.5, hold until 3 < 0.3), guidance for light/blur/
  confidence/GPS, device pre-match against `murals.nearby`, sign-in at the
  lock, left→right→centre sweep on `useDeviceHeading` (drag on desktop),
  keyframes → S3 → submit, verifying ticks, result card (coins count-up,
  discovery confetti, finders dots, scans-today dots), Name sheet.
  Camera switch is now AR | QR | ART; launcher tile live.
- Fixed in passing (affects `/ar` too): the permission gate pushed its
  heading off-screen / under the icon when taller than the viewport
  (`justify-center` + flex shrink); now auto-margins + `shrink-0`, and the
  top padding clears the mode switch.
- Verified headless (iPhone 15 size, fake camera): mural video locks
  ("Mural found" → sign-in sheet), monitor video doesn't. Full sweep/submit
  not exercised yet — needs `db push` and a signed-in session.
- the brand portal Admin › Mural review (`/admin/murals`, nav after Pin review):
  tabs Pending · Gathering · Approved · Rejected · Settings with counts;
  photo-card grid; flags (new account, quick confirm, check photos,
  possible duplicate); preview sheet (all keyframes → set cover, scan map,
  duplicates → merge, edit title/artist); approve/reject/move back with
  Undo; reject dialog with reason + FRAUD coin preview; FRAUD revoke floors
  at 0 and undo restores exactly what was taken. Settings tab edits
  MuralSettings. Keyboard shortcuts not ported yet.
- Not started: mobile camera (needs vision-camera + onnxruntime prebuild —
  ask first), M3 map pins / collection / coins UI.

**2026-10-04 — M3 (web + mobile) and the mobile camera built, DB not pushed**
- the AR app: mural frame markers + layer toggle (all / verified / off) + mural
  sheet on `/map` (loaded by visible area); `/collection` Drops | Murals tab;
  `/murals/[id]` detail (own photo, Found → In review → Verified, history);
  `/coins` ledger with "Redeem coming soon"; Wadzzo Coins row on the profile.
  Camera route moved to `pages/murals/index.tsx`. `murals.byId` now shows a
  "not a mural" rejection to people who scanned it (fraud never).
- wadzzoWebAR-public: `/murals` native camera (gate, detector, gyro sweep that
  treats the first turn as "left", verifying, result, name sheet), murals map
  layer + sheet, Collection › Murals, `/murals/[id]`, `/coins`, AR | QR | ART
  switch live, launcher tile live, `mocked` GPS flag sent to the server.
- Still to do: run the full loop on a device after `db push`; Android build;
  embed toggle (M4); admin keyboard shortcuts; Cloud Vision tuning (needs key).

**2026-10-04 — M4 built**
- Embeds: `MapEmbed.showMurals` (default on) flows through `normalizeConfig`;
  `/embed/[id]` loads approved murals for the view box (skipped beyond ~40 km
  radius), draws them from zoom 12 (`EmbedMap`), and opens a mural card →
  "Open in Wadzzo" (`/murals/[id]?ref=embed-…`). the brand portal embed editor has
  a "Murals" toggle (draft, schema input, default true).
- Admin › Mural review › **Insights** (the brand portal; the plan had it under
  the AR app, but the brand portal is the only admin): 7/30/90-day range; tiles for
  attempts, acceptance, Cloud Vision $ (list-price estimate from
  `costUnits`), coins issued/taken back; stacked daily accepted-vs-rejected
  bars with hover + table view; reject reasons; top-15 accounts with new-
  account and spoof-like (screen / web copy / GPS) flags. Series colours
  validated (dataviz validator, both themes). Checked visually with sample
  data in light + dark.

**2026-10-05 — Mural pack + live outline + turn guide (web + mobile)**
- Pack: `murals/models/manifest.json` (v1: web fp16 ONNX + mobile fp16 TFLite,
  sizes + SHA-256). Auto-starts on app open (never on `/embed`), any network,
  not cancellable. Web: 1 MB Range chunks streamed into IndexedDB (resumes
  after reload), SHA-256 via WebCrypto, installed into Transformers.js'
  `transformers-cache` under the HF URL. Mobile: 1 MB Range chunks (XHR for
  progress) appended to `<pack>.part` (resumes after a kill), SHA-256 via
  expo-crypto, loaded by fast-tflite from the documents dir.
- UI: progress ring + % badge on the AR camera button (badge → game panel:
  emblem, Connect/Download/Verify/Ready, striped bar, MB/s, ETA, tips);
  Murals launcher tile shows pack state; "Mural pack ready" toast + fanfare;
  Profile › Downloads (status/version/size, Download/Repair, Verify, Delete).
  Camera opens while downloading (compact pack strip, capture disabled) and
  re-verifies integrity before detection starts.
- Outline: `localize.ts` (shared) — crop-grid scoring → box, quad snapped to
  wall edges when they agree, box tightened to paint on plain walls.
  Tested offline on 16 Commons photos. Overlay: marching dashes → locked
  glow + corner brackets + "MURAL 92%"; during the sweep it slides with the
  turn toward a pulsing target ghost.
- Turn guide: edge chevron sweep, ghost phone, haptic tick per 3°, generated
  sounds (web WebAudio; mobile WAVs rendered from the same notes).
