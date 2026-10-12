import {
  ViroAmbientLight,
  ViroAnimations,
  ViroARScene,
  ViroDirectionalLight,
  ViroGeometry,
  ViroImage,
  ViroMaterials,
  ViroNode,
  ViroText,
  ViroTrackingStateConstants,
  type ViroCameraTransform,
} from "@reactvision/react-viro";
import { memo, useMemo } from "react";

import { arTextureUrl, coinImage } from "~/lib/ar/arTexture";
import { AR_CAPTURE_RADIUS, formatDistance } from "~/lib/ar/geo";
import { RARITY_META } from "~/lib/ar/rarity";
import type { ArPin, Rarity } from "~/lib/ar/types";
import { buildCoin, PIN_RADIUS_M } from "~/lib/viro/coinGeometry";

/**
 * ── ArWorld ────────────────────────────────────────────────────────────────
 *
 * The Viro scene. Every placed pin is a real 3D object — port of the web's
 * `ArPinObject3D`: a slowly spinning coin (≈38 s per turn) textured with the
 * pin's art, rim coloured by rarity, bobbing gently, with a billboard card floating above it (always faces the viewer).
 * Not-capturable pins get a dimmed, inert finish and no spin — no padlock;
 * the card says *why*.
 *
 * The HUD (reticle, radar, capture button…) is React Native layered over
 * the navigator; this scene only renders the world and reports the camera.
 */

export type PlacedPin = {
  pin: ArPin;
  position: [number, number, number];
  scale: number;
  distance: number;
  capturable: boolean;
  reason: string | null;
};

export type ArWorldProps = {
  placed: PlacedPin[];
  focusedId: string | null;
  onCamera: (t: ViroCameraTransform) => void;
  onTracking: (normal: boolean) => void;
  onPinTap: (id: string) => void;
};

// 32 segments reads as round at AR sizes and is a third lighter than 48 —
// each coin's mesh is sent to the native side separately.
const COIN = buildCoin(32);
/**
 * Overall on-screen size of a pin (coin and card together) on top of
 * the distance-based legibility scale. Aiming uses the same factor (ar.tsx).
 */
export const PIN_SIZE = 2;
const CARD_BG = require("../../../assets/ar/card.png");
/** Matches arBobUp/arBobDown below. */
const BOB_M = 0.12;
/** Air between the top of the coin (at the top of its bob) and the card. */
const CARD_GAP_M = 0.35;

const RARITY_HEX: Record<Rarity, string> = {
  common: "#8FA39A",
  rare: "#35D7F2",
  epic: "#A855F7",
  legendary: "#F5B70A",
  mythic: "#F472B6",
};

let registered = false;
function registerStatic() {
  if (registered) return;
  registered = true;
  ViroMaterials.createMaterials({
    arRimDead: {
      diffuseColor: "#5E6660",
      lightingModel: "Blinn",
      shininess: 0.4,
    },
    ...Object.fromEntries(
      (Object.keys(RARITY_HEX) as Rarity[]).map((r) => [
        `arRim_${r}`,
        { diffuseColor: RARITY_HEX[r], lightingModel: "Blinn", shininess: 0.9 },
      ]),
    ),
  });
  ViroAnimations.registerAnimations({
    arCoinSpin: {
      properties: { rotateY: "+=360" },
      duration: 37_700,
      easing: "Linear",
    },
    arBobUp: {
      properties: { positionY: `+=${BOB_M}` },
      duration: 1_400,
      easing: "EaseInEaseOut",
    },
    arBobDown: {
      properties: { positionY: `-=${BOB_M}` },
      duration: 1_400,
      easing: "EaseInEaseOut",
    },
    // A chain (inner array runs in sequence). Viro's runtime has always
    // accepted name chains; its TypeScript type only models object arrays.
    arBob: [["arBobUp", "arBobDown"]] as never,
    arCardIn: {
      properties: { scaleX: 1, scaleY: 1, scaleZ: 1, opacity: 1 },
      duration: 260,
      easing: "EaseOut",
    },
    arPopIn: {
      properties: { scaleX: 1, scaleY: 1, scaleZ: 1 },
      duration: 260,
      easing: "EaseOut",
    },
  });
}

/**
 * Per-pin face material, created once per pin. Both faces show the brand's
 * image; a pin whose brand has none shows its own image. Chosen up front (no
 * swapping later), so the material exists before the coin names it.
 */
const faceMaterials = new Set<string>();
function faceMaterial(pin: ArPin, dim: boolean) {
  const name = `arFace_${pin.id}_${dim ? "d" : "l"}`;
  if (!faceMaterials.has(name)) {
    faceMaterials.add(name);
    ViroMaterials.createMaterials({
      [name]: {
        diffuseTexture: { uri: arTextureUrl(coinImage(pin)) },
        diffuseColor: dim ? "#6b6f6c" : "#ffffff",
        lightingModel: "Constant",
      },
    });
  }
  return name;
}

export function ArWorld(props: {
  sceneNavigator: { viroAppProps: ArWorldProps };
}) {
  registerStatic();
  const { placed, focusedId, onCamera, onTracking, onPinTap } =
    props.sceneNavigator.viroAppProps;

  return (
    <ViroARScene
      onCameraTransformUpdate={onCamera}
      onTrackingUpdated={(state) =>
        onTracking(state === ViroTrackingStateConstants.TRACKING_NORMAL)
      }
    >
      <ViroAmbientLight color="#ffffff" intensity={420} />
      <ViroDirectionalLight
        color="#ffffff"
        direction={[0.2, -1, -0.4]}
        intensity={600}
      />
      {placed.map((p) => (
        <PinNode
          key={p.pin.id}
          placed={p}
          focused={p.pin.id === focusedId}
          onTap={onPinTap}
        />
      ))}
    </ViroARScene>
  );
}

/*
 * Animation props are constants. A fresh `{ name, run, loop }` object on every
 * render (the scene re-renders ~10×/s with the camera) made Viro restart the
 * bob and spin each time — the coin and its card stuttered back to their start.
 */
/** Each pin scales in once when it's placed (all together, run natively). */
const POP_IN = { name: "arPopIn", run: true, loop: false } as const;
// Same array every render, so React never re-sends it and Viro doesn't reset
// the scale the animation already grew.
const POP_FROM: [number, number, number] = [0.05, 0.05, 0.05];
const BOB_ON = { name: "arBob", run: true, loop: true } as const;
const SPIN_ON = { name: "arCoinSpin", run: true, loop: true } as const;
const BOB_OFF = { name: "arBob", run: false, loop: true } as const;
const SPIN_OFF = { name: "arCoinSpin", run: false, loop: true } as const;

/** Re-render a pin only when something about it visibly changed. */
const samePlaced = (
  a: { placed: PlacedPin; focused: boolean },
  b: { placed: PlacedPin; focused: boolean },
) =>
  a.focused === b.focused &&
  a.placed.pin === b.placed.pin &&
  a.placed.capturable === b.placed.capturable &&
  a.placed.reason === b.placed.reason &&
  a.placed.scale === b.placed.scale &&
  Math.round(a.placed.distance) === Math.round(b.placed.distance) &&
  a.placed.position.every(
    (v, i) => Math.abs(v - (b.placed.position[i] ?? 0)) < 0.01,
  );

const PinNode = memo(function PinNode({
  placed,
  focused,
  onTap,
}: {
  placed: PlacedPin;
  focused: boolean;
  onTap: (id: string) => void;
}) {
  const { pin, position, scale, capturable } = placed;
  const face = useMemo(
    () => faceMaterial(pin, !capturable && !pin.collected),
    [pin, capturable],
  );
  const rim = capturable || pin.collected ? `arRim_${pin.rarity}` : "arRimDead";
  const s = scale * PIN_SIZE;

  return (
    <ViroNode position={position} scale={[s, s, s]}>
      <ViroNode scale={POP_FROM} animation={POP_IN}>
        {/* Bob (outer) and spin (inner) are separate nodes so they compose. */}
        <ViroNode animation={capturable ? BOB_ON : BOB_OFF}>
          <ViroNode
            animation={capturable ? SPIN_ON : SPIN_OFF}
            onClick={() => onTap(pin.id)}
          >
            <ViroGeometry
              vertices={COIN.vertices}
              normals={COIN.normals}
              texcoords={COIN.texcoords}
              // One index list per geometry element (faces, rim), each drawn with
              // the matching entry in `materials`. The published type models a
              // single element of triangles; the native side takes elements.
              triangleIndices={COIN.triangleIndices as never}
              materials={[face, rim]}
            />
          </ViroNode>
        </ViroNode>

        {focused && <Billboard placed={placed} />}
      </ViroNode>
    </ViroNode>
  );
}, samePlaced);

/*
 * ── Billboard ──
 * The info card over the coin, facing the viewer (`billboardY`). Same content
 * and order as the web's ArBillboard: art · rarity + state · title · brand ·
 * distance · description.
 *
 * Laid out by hand, not with ViroFlexView: Viro's flex gave rows unpredictable
 * heights and its text never ellipsizes (a long title wrapped, then got
 * chopped by maxLines). Here every label has an explicit box and is cut with
 * "…" to fit. Viro draws glyphs as bitmaps at the point size (1 pt = 1 cm,
 * kTextPointToWorldScale), so each label is rendered at TEXT_RES× and scaled
 * back down — otherwise text goes soft as you walk up to it.
 *
 * Draw order is forced (renderingOrder: card → art → text). Each glyph is its
 * own transparent quad; Viro sorts transparent objects by distance, so from
 * some angles a glyph drew *before* the card and its invisible margin punched
 * a see-through rectangle in the card — letters looked garbled.
 *
 * Regular weight only: Viro's bold (fontWeight 700) comes out as garbled
 * glyphs on iOS (seen on device) — most likely it picks the wrong face out of
 * Helvetica's font collection. Hierarchy comes from size and colour instead.
 */
const CARD_W = 4.4;
const CARD_H = 2.45;
const PAD = 0.2;
const THUMB_W = 0.84;
const THUMB_H = THUMB_W * (58 / 42); // the web card's 42×58 art
const TEXT_RES = 3;
const FONT = "Helvetica";
/** Card first, art over it, text last (see the note above). */
const ORDER = { card: 10, art: 11, text: 12 } as const;
/**
 * Layer offsets in front of the card. Far pins are drawn scaled up, where a
 * 1–2 cm gap is too thin for the depth buffer and the layers can fight
 * (flicker); a few cm is invisible and always resolves.
 */
const Z = { art: 0.04, text: 0.08 } as const;

/** Rough glyph width as a fraction of the font size (Helvetica regular). */
const CHAR_W = { regular: 0.52, caps: 0.64 } as const;

/** Cut `text` with "…" so it fits `lines` lines of `width` metres at `pt`. */
function fit(
  text: string,
  width: number,
  pt: number,
  kind: keyof typeof CHAR_W,
  lines = 1,
) {
  const perLine = Math.max(4, Math.floor(width / (pt * 0.01 * CHAR_W[kind])));
  const max = perLine * lines;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/*
 * Memoised, with a memoised style: Viro rebuilds a text's glyphs whenever it
 * receives a new style object, and reloads an image on a new `source` object.
 * The card re-renders about once a second (the distance changes), so before
 * this every label and the art flickered on each GPS update.
 */
const Label = memo(function Label({
  x,
  y,
  w,
  h,
  text,
  pt,
  color,
  align = "left",
  lines = 1,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  pt: number;
  color: string;
  align?: "left" | "right" | "center";
  lines?: number;
}) {
  const k = 1 / TEXT_RES;
  const style = useMemo(
    () => ({
      fontFamily: FONT,
      fontSize: pt * TEXT_RES,
      fontWeight: "400" as const,
      color,
      textAlign: align,
      textAlignVertical: "center" as const,
    }),
    [pt, color, align],
  );
  return (
    <ViroText
      text={text}
      // Typed on the common props but not on ViroText's; the native view takes it.
      {...({ renderingOrder: ORDER.text } as object)}
      position={[x, y, Z.text]}
      scale={[k, k, k]}
      width={w * TEXT_RES}
      height={h * TEXT_RES}
      maxLines={lines}
      textClipMode="ClipToBounds"
      textLineBreakMode={lines > 1 ? "WordWrap" : "None"}
      style={style}
    />
  );
});

function Billboard({ placed }: { placed: PlacedPin }) {
  const { pin, distance, capturable, reason } = placed;
  const meta = RARITY_META[pin.rarity];
  const accent = RARITY_HEX[pin.rarity];
  const inRange = distance <= AR_CAPTURE_RADIUS;
  const state = capturable
    ? inRange
      ? "IN RANGE"
      : "WALK CLOSER"
    : (reason ?? (pin.collected ? "COLLECTED" : "UNAVAILABLE")).toUpperCase();
  const stateColor =
    capturable && inRange ? "#79f07a" : capturable ? "#f2c14e" : "#8a978f";

  // Card-local metres, origin at the card's centre.
  const left = -CARD_W / 2 + PAD;
  const top = CARD_H / 2 - PAD;
  const colX = left + THUMB_W + 0.18;
  const colW = CARD_W / 2 - PAD - colX;
  const row = (topY: number, h: number) => topY - h / 2; // centre y of a row

  const r1H = 0.26;
  const r1Y = row(top, r1H);
  const r2H = 0.6; // two lines of 24pt
  const r2Y = row(top - r1H - 0.06, r2H);
  const r3H = 0.28;
  const r3Y = row(top - r1H - 0.06 - r2H - 0.04, r3H);
  // Below whichever is lower: the art or the brand row.
  const descTop = Math.min(top - THUMB_H, r3Y - r3H / 2) - 0.14;
  const descH = descTop - (-CARD_H / 2 + PAD);
  const distW = 0.9;
  const art = useMemo(
    () => ({ uri: arTextureUrl(pin.imageUrl) }),
    [pin.imageUrl],
  );

  return (
    <ViroNode
      position={[0, PIN_RADIUS_M + BOB_M + CARD_GAP_M + CARD_H / 2, 0]}
      transformBehaviors={["billboardY"]}
    >
      <ViroImage
        source={CARD_BG}
        width={CARD_W}
        height={CARD_H}
        {...({ renderingOrder: ORDER.card } as object)}
      />
      <ViroImage
        source={art}
        position={[left + THUMB_W / 2, top - THUMB_H / 2, Z.art]}
        width={THUMB_W}
        height={THUMB_H}
        resizeMode="ScaleToFill"
        imageClipMode="ClipToBounds"
        {...({ renderingOrder: ORDER.art } as object)}
      />
      {/* Rarity (its colour) · state */}
      <Label
        x={colX + colW * 0.25}
        y={r1Y}
        w={colW * 0.5}
        h={r1H}
        pt={16}
        color={accent}
        text={fit(
          `${meta.short} ${meta.label.toUpperCase()}`,
          colW * 0.5,
          16,
          "caps",
        )}
      />
      <Label
        x={colX + colW * 0.75}
        y={r1Y}
        w={colW * 0.5}
        h={r1H}
        pt={16}
        align="right"
        color={stateColor}
        text={fit(state, colW * 0.5, 16, "caps")}
      />
      {/* Title */}
      <Label
        x={colX + colW / 2}
        y={r2Y}
        w={colW}
        h={r2H}
        pt={24}
        lines={2}
        color="#f2f7f4"
        text={fit(pin.title, colW, 24, "regular", 2)}
      />
      {/* Brand · distance */}
      <Label
        x={colX + (colW - distW) / 2}
        y={r3Y}
        w={colW - distW}
        h={r3H}
        pt={18}
        color="#9fb0a6"
        text={fit(pin.brandName, colW - distW, 18, "regular")}
      />
      <Label
        x={colX + colW - distW / 2}
        y={r3Y}
        w={distW}
        h={r3H}
        pt={18}
        align="right"
        color="#79f07a"
        text={formatDistance(distance)}
      />
      {/* Description, two lines */}
      {pin.description ? (
        <Label
          x={0}
          y={descTop - descH / 2}
          w={CARD_W - PAD * 2}
          h={descH}
          pt={16}
          lines={2}
          color="#b9c7bf"
          text={fit(pin.description, CARD_W - PAD * 2, 16, "regular", 2)}
        />
      ) : null}
    </ViroNode>
  );
}
