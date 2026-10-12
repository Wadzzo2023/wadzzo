# 06 · AR and QR

One camera screen behind the AR tab, two modes, switched by the glass
**AR | QR** pill at the top (port of web `CameraModeSwitch`). Separate routes
(`/ar`, `/scan`), `router.replace` between them so "Exit" returns to where the
camera was opened from. Viro and `expo-camera` never run at the same time —
switching unmounts one before mounting the other.

## Permission gate

Port of `ArPermissionGate`: one screen, one tap asks for camera, then
location. Rows show granted / denied / pending with per-platform "how to fix"
steps and **Open Settings**. The scene still opens if location is denied
(pins can't be placed → an explanatory empty state), and the gate is skipped
entirely when everything is already granted.

## AR scene (Viro)

```
ViroARSceneNavigator
 └ ViroARScene (worldAlignment: "GravityAndHeading")
    ├ ViroAmbientLight + one directional light (soft shadows)
    ├ PinNode × N                          ← only capturable pins (web rule),
    │   ├ Coin                                 or the single ?pin= pin
    │   ├ GroundShadow
    │   └ Billboard
    └ (no hand-placed UI in 3D — HUD is RN views over the scene)
```

### Placing pins from GPS
- `worldAlignment: "GravityAndHeading"` makes −Z = true north, +X = east, so a
  pin's scene position is its bearing/distance from the user:
  `x = d·sin(bearing)`, `z = −d·cos(bearing)`, `y = PIN_FLOAT_HEIGHT_M − eye height`.
  Uses `geo.ts` / `projection.ts` ported from the web.
- Distances compressed beyond 30 m (same curve as the web) so far pins stay
  visible but clearly far.
- Re-anchor on each GPS fix with a low-pass filter; never jump a pin more than
  0.5 m per frame.

### Coin (port of web `ArPinObject3D`)
- Disc: radius **1.35 m**, thickness 0.26 m, floating 0.85 m above ground.
- Faces textured with the pin's image; rim coloured by rarity (`RARITY_HSL`).
- Spin 0.5/3 rad/s (~38 s per turn) — slow enough to read the face.
- Gentle bob (float animation), ground shadow quad (opacity 0.38).
- Not collectible → dimmed, inert finish; no padlock.
- Model: `ViroCylinder` (or `Viro3DObject` coin mesh) + `ViroMaterials` per pin.

### Billboard
- `ViroFlexView` with `transformBehaviors={["billboardY"]}`, hanging beside the
  coin (width = radius × 5.2, as web `CARD_WORLD_W`).
- Content = the web card: brand avatar + name, title, RarityPlate, distance,
  and — when not capturable — *why* ("Walk 40 m closer", "Follow to unlock").
- Slides in when the pin is aimed at (reticle hit), out otherwise; pulses when
  in range (old app's `billboardSlideIn/Out/Pulse` animations are a good base).

### HUD (React Native over the scene)
Exit (top-left), **AR | QR** (top-centre), radar (top-right, 86 px), compass
strip, centre reticle (locks + arms), edge arrows for off-screen pins,
bottom action: **Capture** when armed, otherwise the distance/reason.

### Capture
Tap Capture (or tap the coin) → 🔒 → `POST /pins/:id/collect { lat, lng }`.
Success only after the server confirms → `CollectCelebration` → card detail.
Refusals (range, eligibility, stock) show verbatim in a toast under the top
bar. Haptic + sound on success.

### Modes
- `/ar` — all nearby capturable pins.
- `/ar?target=id` — all pins, tie broken toward `id` (from PinSheet "Capture").
- `/ar?pin=id` — single pin, range ignored (revisit an owned card).

## QR scanner

- `expo-camera` `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`.
- Web `/scan` layout: dimmed surround, 228 px viewfinder with green corner
  brackets and the sweeping scan line, bottom glass panel with instructions.
- Accept the full URL the codes encode (`https://…/scan?pin=<id>`) via the
  ported `pinIdFromScan`; anything else → "That isn't a Wadzzo code."
- Debounce repeated reads of the same code; claim → Claiming → Collected →
  card detail; or the server's message verbatim, then back to scanning.
- Torch toggle (approved native addition).

## Performance budget
- 60 fps on iPhone 12 / Pixel 6 with 20 pins in view.
- Textures ≤ 512 px, loaded once and cached; dispose materials on unmount.
- Cap rendered pins at the nearest 25.
