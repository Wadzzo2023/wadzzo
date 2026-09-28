import * as THREE from "three";

import { pinStatus } from "~/lib/ar/rarity";
import type { ArPin } from "~/lib/ar/types";

import { RARITY_HSL } from "./rarityColor";

/**
 * Real-world size of a pin, in metres. A 2.7 m disc — bigger than a real coin
 * has any business being, deliberately: this is the size the pin actually
 * needs to read clearly and stay tappable at typical AR viewing/capture
 * distances (a handful of metres, seen through a phone's field of view), not
 * the size a physical collectible of this shape would be. It replaced a
 * `radius = 5` inherited from bandfan — a ten-metre coin, the width of a
 * house — and has been sized up twice since as the visible-and-legible bar
 * moved: this app is used outdoors in daylight glare on a small screen, where
 * "technically visible" and "actually easy to spot and hit" are different
 * bars.
 *
 * Everything else that has a size — the card, the shadow, the bob — is
 * expressed as a multiple of this, so the whole pin stays in proportion if
 * it's ever retuned again.
 */
const PIN_RADIUS_M = 1.35;
const PIN_THICKNESS_M = 0.26;

/**
 * How high above the ground a pin floats, in metres — roughly waist height, so
 * it sits in the frame like something you could reach out and take.
 *
 * Exported because two places have to agree on it: the scene positions the pin
 * this far above ground level, and the pin hangs its own shadow this far below
 * itself. If they ever disagreed the shadow would float or sink into the
 * pavement, which is worse than having no shadow at all.
 */
export const PIN_FLOAT_HEIGHT_M = 0.85;

/** How dark the ground shadow is directly under a resting pin. */
const SHADOW_OPACITY = 0.38;

/**
 * Coin spin, radians/second. A third of bandfan's own `AR-Coin.tsx` rate
 * (0.5 rad/s, a full turn every ~12.6s) — this pin renders noticeably larger
 * than bandfan's, and at the original speed spent a good chunk of every
 * rotation edge-on, a thin sliver rather than a readable image. ~37.7s per
 * turn keeps the same motion, just unhurried enough to actually look at.
 */
const SPIN_RATE = 0.5 / 3;

/**
 * Card canvas pixels, and how wide the card hangs in the world, in metres.
 * `CARD_W`/`CARD_H` are the canvas's actual pixel resolution — what
 * `drawCard()` lays text out against — and don't change with world size;
 * `CARD_WORLD_W` is purely how large that same rendered texture is displayed
 * at, so scaling it up doesn't affect text wrapping or blur the type, it just
 * makes the whole card bigger and easier to read from further away.
 */
const CARD_W = 1024;
const CARD_H = 500;
const CARD_WORLD_W = PIN_RADIUS_M * 5.2;

/**
 * ── ArPinObject3D ──────────────────────────────────────────────────────────
 *
 * A real 3D object for one pin: a slowly spinning coin at true human scale,
 * textured with the pin's own image, floating above a soft shadow on the
 * ground, with an information card hanging beside it. Adapted from bandfan's
 * `ARCoin` for wadzzoAR's actual pin shape.
 *
 * The coin carries only what it can say without words — rarity in its edge
 * colour, and a dimmed, inert finish when a pin isn't collectible. It used to
 * wear a padlock badge too; that's gone, because a symbol stuck on an object
 * can say *that* something is wrong but never *why*, and the card right next
 * to it has room to explain. Anything that needs a sentence belongs there.
 *
 * The shadow is the reason this reads as present in the world rather than
 * composited over it. Without ground contact an object has no established
 * relationship to the surface beneath it, and the eye files it as an overlay
 * no matter how correct its projection is.
 */
export class ArPinObject3D {
  private mesh: THREE.Mesh;
  private pin: ArPin;
  private shadow: THREE.Mesh | null = null;
  /** Rest height of the coin, so the bob can be measured against it. */
  private baseY = 0;

  private cardSprite: THREE.Sprite | null = null;
  private cardCanvas: HTMLCanvasElement | null = null;
  private cardTexture: THREE.CanvasTexture | null = null;
  private isOpen = false;
  /** Last distance painted onto the card, metres, rounded. */
  private distanceM: number | null = null;
  private inRange = false;

  constructor(pin: ArPin) {
    this.pin = pin;
    this.mesh = this.createCoinMesh();
    this.createGroundShadow();
    this.createCardSprite();
  }

  // ── Coin ───────────────────────────────────────────────────────────────

  private createCoinMesh(): THREE.Mesh {
    const radius = PIN_RADIUS_M;
    const thickness = PIN_THICKNESS_M;
    const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 32);
    geometry.rotateX(Math.PI / 2);

    const [h, s, l] = RARITY_HSL[this.pin.rarity];
    // Locked and depleted pins read as inert metal rather than the bright
    // rarity colour — the same "this isn't active" cue `StatusBadge` gives
    // in the 2D UI, carried over to an object you can walk around.
    const status = pinStatus(this.pin);
    const active = status === "collectible";
    const edgeColor = new THREE.Color().setHSL(
      h / 360,
      active ? s : s * 0.25,
      active ? l : Math.min(l, 0.32),
    );

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: edgeColor,
      roughness: 0.3,
      metalness: 0.75,
      emissive: edgeColor,
      emissiveIntensity: active ? 0.35 : 0.08,
    });

    const faceTexture = this.loadFaceTexture();
    const faceMaterial = new THREE.MeshStandardMaterial({
      map: faceTexture,
      roughness: 0.35,
      metalness: 0.5,
      emissive: 0x222222,
      emissiveIntensity: 0.25,
    });

    // [edge, front, back] — the order CylinderGeometry's material groups
    // expect.
    const mesh = new THREE.Mesh(geometry, [
      edgeMaterial,
      faceMaterial,
      faceMaterial,
    ]);
    mesh.userData.pinId = this.pin.id;
    this.addFloatingAnimation(mesh);
    return mesh;
  }

  /** Canvas fallback drawn immediately; swapped for the real image once loaded. */
  private loadFaceTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const [h, s, l] = RARITY_HSL[this.pin.rarity];
      const gradient = ctx.createLinearGradient(0, 0, 256, 256);
      gradient.addColorStop(0, `hsl(${h} ${s * 100}% ${Math.max(l * 100 - 15, 10)}%)`);
      gradient.addColorStop(1, `hsl(${h} ${s * 100}% ${Math.min(l * 100 + 10, 90)}%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);

      const initials = this.pin.brandName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join("");
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 96px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials || "?", 128, 128);
    }
    const fallback = new THREE.CanvasTexture(canvas);
    rotateFaceTexture(fallback);

    // The pin's own `imageUrl` already resolves through a fallback chain
    // server-side (own image → brand image → platform icon), so there's
    // always something real to fetch — proxied for CORS, same reasoning as
    // `pages/api/proxy-image`.
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    const proxied = `/api/proxy-image?url=${encodeURIComponent(this.pin.imageUrl)}`;
    loader.load(
      proxied,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        rotateFaceTexture(texture);
        const materials = this.mesh.material;
        if (Array.isArray(materials)) {
          for (const m of [materials[1], materials[2]]) {
            const mat = m as THREE.MeshStandardMaterial | undefined;
            if (mat) {
              mat.map = texture;
              mat.needsUpdate = true;
            }
          }
        }
      },
      undefined,
      () => {
        // Fallback canvas texture is already applied — nothing to do.
      },
    );

    return fallback;
  }

  private addFloatingAnimation(mesh: THREE.Mesh) {
    const phase = Math.random() * Math.PI * 2; // desynced so a cluster doesn't bob in unison
    // `baseY` is captured lazily, on the *first tick*, rather than here —
    // this runs from the constructor, before the caller has had a chance to
    // position the mesh via `locar.add()`. Capturing `mesh.position.y`
    // synchronously here would always read the THREE.Object3D default (0),
    // and every frame after would then re-centre the bob on the ground
    // instead of on `PIN_FLOAT_HEIGHT_M` — a pin bobbing at camera-eye
    // height's opposite end, foreshortened almost edge-on from above, which
    // is exactly what reads as "warped" or "not really moving" rather than
    // as a coin gently floating in front of you. `requestAnimationFrame`
    // never fires before the synchronous code that scheduled it finishes, so
    // by the first tick `locar.add()` has already run and `position.y` holds
    // the real value.
    let baseYSet = false;
    const tick = () => {
      if (!baseYSet) {
        this.baseY = mesh.position.y;
        baseYSet = true;
      }
      const t = Date.now() * 0.001;
      // Bob amplitude scaled to the object, not left at the 0.3 m that suited
      // a ten-metre coin — a 1.2 m disc heaving 60 cm reads as bouncing.
      mesh.position.y = this.baseY + Math.sin(t * 2 + phase) * PIN_RADIUS_M * 0.18;
      // Bandfan's own coin spin (`AR-Coin.tsx`'s `addFloatingAnimation`):
      // `rotation.y = originalRotationY + time * 0.5`, a full turn every
      // ~12.6s. This is the same formula, at a third of that rate — a full
      // turn every ~37.7s — since a coin the size this one now renders at
      // spends noticeably longer edge-on at bandfan's original speed.
      // Deliberately independent of camera position, matching bandfan
      // exactly: every coin turns in sync on the same world clock, rather
      // than each one separately tracking whoever's looking at it.
      mesh.rotation.y = t * SPIN_RATE;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  private raf: number | null = null;

  // ── Ground contact ─────────────────────────────────────────────────────

  /**
   * A soft radial blob laid flat on the ground under the coin.
   *
   * Not a real cast shadow: there is no light source in the scene that agrees
   * with the sun in the camera image, so a geometrically-correct shadow would
   * fall in a direction the footage contradicts, which is worse than none. A
   * symmetrical blob under the object makes no claim about lighting, and
   * carries the one thing actually needed — that the object is *above a
   * surface*, at a specific height.
   */
  private createGroundShadow() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,0.85)");
      g.addColorStop(0.55, "rgba(0,0,0,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }

    const geometry = new THREE.PlaneGeometry(PIN_RADIUS_M * 3, PIN_RADIUS_M * 3);
    geometry.rotateX(-Math.PI / 2); // lie flat
    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      opacity: SHADOW_OPACITY,
      depthWrite: false, // never occlude the coin above it
    });

    this.shadow = new THREE.Mesh(geometry, material);
    // Just above the pin's own origin-to-ground drop. The scene places a pin's
    // origin at eye-relative height; the ground sits below that by however far
    // the pin floats, which `ArSceneWebGL` owns — so this hangs at the pin's
    // own float height beneath it.
    this.shadow.position.y = -PIN_FLOAT_HEIGHT_M;
    this.mesh.add(this.shadow);
  }

  // ── In-world billboard card ────────────────────────────────────────────

  /**
   * The pin's information, drawn to a canvas and hung in the world above the
   * coin — bandfan's approach, with wadzzo's own fields.
   *
   * It lives in the scene rather than in the HUD so it belongs to the object:
   * it sits at the coin's position, shares its perspective, and shrinks with
   * distance. A panel pinned to the bottom of the screen describes a pin; this
   * one is attached to it.
   *
   * Drawn at 2x the sprite's nominal pixel size so text stays crisp when a
   * pin is close and the card fills a good part of the frame.
   */
  private createCardSprite() {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    this.cardCanvas = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.cardTexture = texture;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false, // always legible, never half-buried in its own coin
    });

    this.cardSprite = new THREE.Sprite(material);
    this.cardSprite.scale.set(CARD_WORLD_W, CARD_WORLD_W * (CARD_H / CARD_W), 1);
    // Clear of the coin and its bob, in the pin's own local space.
    this.cardSprite.position.set(0, PIN_RADIUS_M * 2.4, 0);
    this.cardSprite.visible = false;
    this.cardSprite.renderOrder = 10;
    this.mesh.add(this.cardSprite);

    this.drawCard();
  }

  /** Repaint the card. Cheap enough to call when the distance text changes. */
  private drawCard() {
    const ctx = this.cardCanvas?.getContext("2d");
    if (!ctx) return;

    const pin = this.pin;
    const [h, s, l] = RARITY_HSL[pin.rarity];
    const rarity = `hsl(${h} ${s * 100}% ${l * 100}%)`;
    const rarityWash = `hsl(${h} ${s * 100}% ${l * 100}% / 0.16)`;
    const status = pinStatus(pin);

    ctx.clearRect(0, 0, CARD_W, CARD_H);
    // Every measurement below is from the top of its own line. The previous
    // version mixed alphabetic baselines with hand-added offsets, which is why
    // rows drifted into each other as soon as a title wrapped to two lines.
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Panel
    ctx.fillStyle = "rgba(6, 14, 10, 0.94)";
    roundRect(ctx, 4, 4, CARD_W - 8, CARD_H - 8, 36);
    ctx.fill();
    ctx.strokeStyle = `hsl(${h} ${s * 100}% ${l * 100}% / 0.5)`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Rarity spine down the leading edge — the same colour language the 2D UI
    // uses, so a pin reads the same in AR as in the collection.
    ctx.fillStyle = rarity;
    roundRect(ctx, 4, 4, 16, CARD_H - 8, 8);
    ctx.fill();

    const padX = 64;
    const right = CARD_W - 56;
    const width = right - padX;
    let y = 54;

    // ── Row 1: rarity chip, and status chip pinned to the right ───────────
    const chipH = 54;
    ctx.font = "700 27px ui-sans-serif, system-ui, sans-serif";
    pill(ctx, padX, y, pin.rarity.toUpperCase(), rarityWash, rarity, chipH);

    const locked = pin.locked;
    const statusText = locked
      ? "LOCKED"
      : status === "collected"
        ? "COLLECTED"
        : status === "depleted"
          ? "ALL CLAIMED"
          : status === "expired"
            ? "EXPIRED"
            : this.inRange
              ? "IN RANGE"
              : "TOO FAR";
    const good = !locked && status === "collectible" && this.inRange;
    const statusFg = locked
      ? "rgb(255, 196, 128)"
      : good
        ? "rgb(122, 255, 170)"
        : "rgba(198, 224, 208, 0.85)";
    const statusBg = locked
      ? "rgba(255, 196, 128, 0.15)"
      : good
        ? "rgba(122, 255, 170, 0.15)"
        : "rgba(198, 224, 208, 0.1)";

    const statusW = ctx.measureText(statusText).width + 44;
    pill(ctx, right - statusW, y, statusText, statusBg, statusFg, chipH);

    y += chipH + 30;

    // ── Row 2: title ──────────────────────────────────────────────────────
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 54px ui-sans-serif, system-ui, sans-serif";
    y = wrapTop(ctx, pin.title, padX, y, width, 64, 2);

    // ── Row 3: brand ──────────────────────────────────────────────────────
    y += 10;
    ctx.font = "500 29px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(198, 224, 208, 0.66)";
    ctx.fillText(truncate(ctx, pin.brandName, width), padX, y);
    y += 50;

    // ── Row 4: distance, and how much of the drop is left ──────────────────
    // Same convention `PinSheet` uses in the 2D collection view — a plain
    // count against the group's cap, or no denominator at all for a group
    // whose creator left it open. Right-aligned against the same `right` edge
    // the status chip above already uses, so the two numeric facts read as a
    // pair rather than two unrelated lines.
    const remainingText =
      pin.supply != null
        ? `${pin.remaining} of ${pin.supply.toLocaleString()} left`
        : `${pin.remaining.toLocaleString()} left`;

    if (this.distanceM != null) {
      ctx.font = "700 42px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = rarity;
      ctx.fillText(`${formatMetres(this.distanceM)} away`, padX, y);
    }
    ctx.font = "600 26px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "rgba(198, 224, 208, 0.6)";
    ctx.fillText(remainingText, right - ctx.measureText(remainingText).width, y + 10);
    y += 58;

    // ── Row 5: the one line that says what to do about it ─────────────────
    // With the padlock gone from the coin, this is now the *only* place a
    // locked pin explains itself, so the reason gets priority over the
    // generic prompt whenever there is one.
    const note = locked
      ? (pin.lockReason ?? "Locked — you can't collect this one yet.")
      : status === "collected"
        ? "Already in your collection."
        : status === "collectible"
          ? this.inRange
            ? "Tap Capture to collect it."
            : "Walk closer to capture."
          : "";

    // The threshold is deliberately close to the card's own bottom edge, not
    // a generous margin — this note is the *only* place a locked pin explains
    // itself now that the coin carries no badge, so it should draw unless
    // there is truly no room left, not just when the layout ran long.
    if (note && y < CARD_H - 40) {
      ctx.font = "500 27px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = locked
        ? "rgba(255, 196, 128, 0.9)"
        : "rgba(198, 224, 208, 0.6)";
      wrapTop(ctx, note, padX, y, width, 34, 2);
    }

    if (this.cardTexture) this.cardTexture.needsUpdate = true;
  }

  /**
   * Feed the card the two things that change as someone walks around: how far
   * away the pin is, and whether that's close enough to take. Repaints only
   * when the displayed text would actually differ, so this can be called every
   * frame without redrawing a canvas 60 times a second.
   */
  setRangeInfo(distanceM: number, inRange: boolean) {
    const rounded = Math.round(distanceM);
    if (rounded === this.distanceM && inRange === this.inRange) return;
    this.distanceM = rounded;
    this.inRange = inRange;
    if (this.cardSprite) this.drawCard();
  }

  open() {
    if (!this.cardSprite || this.isOpen) return;
    this.isOpen = true;
    this.cardSprite.visible = true;
    animateOpacity(this.cardSprite.material, 0, 1, 200);
  }

  close() {
    if (!this.cardSprite || !this.isOpen) return;
    this.isOpen = false;
    const sprite = this.cardSprite;
    animateOpacity(sprite.material, sprite.material.opacity, 0, 160, () => {
      sprite.visible = false;
    });
  }

  isCardOpen(): boolean {
    return this.isOpen;
  }

  // ── Per-frame ──────────────────────────────────────────────────────────

  /**
   * Keep the ground shadow pinned to the ground while the coin bobs above it.
   *
   * The shadow must *not* bob with its object — that is precisely the cue that
   * reads as contact. A shadow that rises and falls with the coin looks glued
   * to it; one that stays on the ground and only breathes in size tells the eye
   * the coin is hovering over a real surface.
   */
  update(_camera: THREE.Camera) {
    // The card is a Sprite, so three.js already faces it at the camera every
    // frame — nothing to do for it here. The coin's own rotation is a free
    // spin driven entirely by `addFloatingAnimation`'s own clock, matching
    // bandfan — nothing camera-relative to do here either. `_camera` stays in
    // the signature only because the render loop calls every pin the same way.

    if (!this.shadow) return;
    const lift = this.mesh.position.y - this.baseY;
    // Higher object → larger, fainter shadow, the way a real penumbra widens
    // with distance from the surface casting onto it.
    const spread = 1 + lift * 0.5;
    this.shadow.scale.set(spread, spread, 1);
    const mat = this.shadow.material as THREE.MeshBasicMaterial;
    mat.opacity = SHADOW_OPACITY / spread;
  }

  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  getPin(): ArPin {
    return this.pin;
  }

  dispose() {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.mesh.geometry.dispose();
    const materials = Array.isArray(this.mesh.material)
      ? this.mesh.material
      : [this.mesh.material];
    for (const m of materials) m.dispose();

    if (this.shadow) {
      this.shadow.geometry.dispose();
      const mat = this.shadow.material as THREE.MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    if (this.cardSprite) {
      this.cardSprite.material.map?.dispose();
      this.cardSprite.material.dispose();
    }
  }
}

// ── Canvas helpers ─────────────────────────────────────────────────────────

/**
 * Rotate a coin face texture 90° around its own centre.
 *
 * `CylinderGeometry`'s cap UVs aren't oriented the way a flat image maps onto
 * a coin face intuitively — without this, any texture applied to the cap
 * renders sideways, regardless of what's actually drawn in it (a loaded
 * photo, or the canvas-drawn initials fallback below both need it equally,
 * since the misorientation comes from the geometry's own UV layout, not
 * from either texture's content). Ported directly from bandfan's
 * `AR-Coin.tsx`, which applies the identical correction to the identical
 * geometry (same `CylinderGeometry(radius, radius, thickness, 32)` +
 * `rotateX(Math.PI / 2)` construction) — this file's own coin never carried
 * it over when it was adapted, which is what made every pin's image render
 * rotated a quarter turn.
 */
function rotateFaceTexture(texture: THREE.Texture) {
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI / 2;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw `text` wrapped to `maxWidth`, at most `maxLines`, with `textBaseline`
 * set to "top". Returns the y the *next* row should start at, so callers can
 * flow down the card without knowing how many lines this took.
 */
function wrapTop(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let drawn = 0;
  let cursorY = y;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      drawn += 1;
      if (drawn === maxLines) {
        ctx.fillText(truncate(ctx, `${line}…`, maxWidth), x, cursorY);
        return cursorY + lineHeight;
      }
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    ctx.fillText(truncate(ctx, line, maxWidth), x, cursorY);
    cursorY += lineHeight;
  }
  return cursorY;
}

/** A rounded chip with vertically-centred text. Returns its width. */
function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bg: string,
  fg: string,
  h: number,
): number {
  const w = ctx.measureText(text).width + 44;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();

  const prev = ctx.textBaseline;
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 22, y + h / 2);
  ctx.textBaseline = prev;
  return w;
}

/** Shorten with an ellipsis until it fits `maxWidth`. */
function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** Metres for a card that has to stay readable at a glance. */
function formatMetres(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function animateOpacity(
  material: THREE.SpriteMaterial,
  from: number,
  to: number,
  duration: number,
  onDone?: () => void,
) {
  const start = Date.now();
  const tick = () => {
    const t = Math.min((Date.now() - start) / duration, 1);
    material.opacity = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(tick);
    else onDone?.();
  };
  tick();
}
