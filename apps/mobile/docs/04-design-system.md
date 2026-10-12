# 04 · Design system — "same to same" as wadzzoAR

**Source of truth is the web repo**: `wadzzoAR/src/styles/arcade.css`,
`tailwind.config.ts`, `src/lib/fonts.ts`, and the components themselves. When
the web changes, the app follows. Nothing here is a redesign.

## Tokens

`scripts/sync-tokens.ts` parses `arcade.css` (`:root` = light, `.dark` = dark)
and writes `src/theme/tokens.ts`. Run it whenever the web palette changes; CI
fails if the generated file is stale.

| Token | Light (HSL) | Dark (HSL) | Use |
|---|---|---|---|
| `ar-void` | 140 25% 97% | 152 30% 3% | behind everything, camera letterbox |
| `ar-bg` | 140 20% 95% | 152 22% 5% | screen ground |
| `ar-surface` / `-2` / `-3` | white → 91% | 9% → 18% | cards, sheets, pressed |
| `ar-line` / `-bright` | 83% / 70% | 24% / 34% | hairlines, dashed drop zones |
| `ar-text` / `-dim` / `-faint` | 9% / 30% / 46% | 96% / 68% / 45% | ink ladder |
| `ar-green` / `-hot` / `-deep` / `-ink` | 25% / 20% / 22% / 97% | 52% / 64% / 28% / 8% | brand energy; `-ink` = text on green fill |
| `rarity-common…mythic` | relit for white | neon | rarity ladder |
| `ar-danger`, `ar-locked` | | | errors, locked pins |

Radii: `ar-sm 10` · `ar 16` · `ar-lg 22` · `ar-xl 30`.
Opacity modifiers: **only the generated steps** (`/5 /10 /15 /20 …`). The web
has a latent bug where `/12` and `/14` generate nothing — don't port it.

Theme: **System / Light / Dark**, same three-way setting as web Profile →
Appearance. `useColorScheme()` + persisted preference. Map style follows
(`mapbox://styles/mapbox/light-v11` / `dark-v11`).

## Type

| Role | Family | Weights | Web variable |
|---|---|---|---|
| HUD / display (`font-hud`) | **Chakra Petch** | 400–700 | `--font-display` |
| Body | **Sora** | 300–700 | `--font-body` |
| Creator titles | **Bungee Shade** | 400 | `--font-creator-title` |

HUD text is uppercase with wide tracking (0.08–0.32em). Keep the exact sizes
from the web classes (e.g. eyebrow 10px / 0.32em, screen title 26px bold,
tab label 9.5px / 0.14em). Respect the OS text size up to 1.3× on body text;
HUD labels stay fixed so the chrome doesn't break.

## Surfaces

| Web class | Native |
|---|---|
| `.ar-glass` (blurred translucent) | `BlurView` (`expo-blur`, intensity ~40, tint by theme) + 1px `ar-line` border |
| `.ar-bevel` (inset panel) | surface-2 fill + inner top highlight (1px white/10) + border |
| `.ar-key` / `ar-key-primary` / `-gold` / `-danger` (key-cap buttons on a 3px plinth) | `ArButton`: a Pressable whose face translates 3px down onto its plinth on press-in (Reanimated), with a haptic `selection` tick |
| `.ar-grid` | Skia grid pattern |
| `.ar-scanlines` | Skia line shader, 30% |
| `.ar-tabbar-surface` | solid surface, `rounded-t-ar-xl`, no blur (same reason as web) |
| `.text-glow(-soft)` | `textShadow` |

## Motion

Library: Reanimated 4. Every spring below is copied from the web so the feel
matches exactly.

| Thing | Spec (from web) |
|---|---|
| Tab bar lit plate sliding between tabs | spring stiffness 520, damping 38, mass 0.7 |
| Tab icon lift on active | y −1, scale 1.06, spring 480/26 |
| Segmented control pill | spring 460/34/0.7 |
| Bottom sheet in/out | spring 420/38/0.9; drag-to-dismiss past 90 px or 620 px/s |
| Screen enter | fade + scale 0.985→1, 200 ms ease-out (no exit animation, same as web) |
| AR launcher conic ring | rotate 360° / 2.4 s linear |
| Sonar pulse ring | 2.2 s cubic-bezier(0.2,0.7,0.3,1) |
| Skeleton sweep | 1.6 s ease-in-out |
| QR scan sweep | 3 s ease-in-out (UI thread) |
| Float | 4.5 s ease-in-out; slow spin 9 s |

`useReducedMotion()` → skip the boot sequence, confetti, pulses; springs
become 150 ms fades. Same rule as the web's `prefers-reduced-motion`.

## Signature pieces (each ported by name)

| Component | What it must do |
|---|---|
| **BootSequence** | Cold-start overlay above the mounting map. Five beats: ignite (scanline sweep, grid up) → assemble (mark drops, W-A-D-Z-Z-O fly in with chromatic fringing) → stamp (AR plate slams, shockwave) → boot (status lines type over a 5-segment charge bar) → open (iris opens onto the live map). Tap to skip. Once per cold start. Replaces the native splash seamlessly (splash = first frame of "ignite"). |
| **BottomTabBar** | Edge-to-edge console, rounded top, flush to the bottom safe area. Map · Cards · **[AR]** · Bounty · Brands. Raised circular AR launcher with the rotating conic ring and viewfinder-corner glyph; sonar pulse when on AR/QR. Bounty tab dot. |
| **ProfileButton** | Avatar top-right of every root screen (floating glass on Map). Dot for unseen bounty events. |
| **ScreenHeader** | Eyebrow + title, trailing slot, back variant for pushed screens. |
| **HoloCard** | Trading-card with foil. Native upgrade: tilt from the gyroscope (`expo-sensors`) drives the foil highlight via a Skia shader. |
| **PackOpening** | sealed → stripping → tearing → open; once per card (persisted). |
| **CollectCelebration** | Card rises, flips, lands with shockwave, stamped; hold time scales with rarity; confetti in rarity palette; haptic `notificationSuccess` + rarity sound. |
| **Skeletons** | Same shapes as the real content (`BrandRowSkeleton`, `CardSkeleton`, `NearbyCardSkeleton`, `StatRowSkeleton`, `BountyCardSkeleton`). Never a spinner where a skeleton fits. |
| **ArButton / ArIconButton / Chip / StatBlock / RarityPlate / StatusBadge / DetectionBadge / SegmentedTabs / BottomSheet** | 1:1 ports. |

## Feedback

`feedback.ts` equivalents: `expo-haptics` (selection on taps, impact on
capture, success/warning notifications), `expo-audio` for capture chime and
rarity stings. Both obey Profile → Haptics / Sound toggles.

## Parity check

Every screen gets a side-by-side screenshot review against the web app in a
393×852 viewport (iPhone 16 size), light and dark, before it's marked done.
