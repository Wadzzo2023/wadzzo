import { z } from "zod";

/**
 * How a pin looks on every map: its shape, what fills the shape (the brand's
 * logo, the pin's own image, or a plain colour), the colour, how the image
 * sits inside, and whether auto-collect pins show a ⚡ badge.
 *
 * A shape is only ever an outline path in a 100×100 box, written with
 * absolute commands (M L H V C S Q T A Z). An uploaded SVG is never stored or
 * served: paths are checked here, and the apps draw everything else
 * themselves, so a shape can't carry scripts or links.
 *
 * Every reader goes through `resolvePinLook`, which falls back step by step
 * (missing custom shape → built-in → circle; pin image → brand logo → colour)
 * so a pin always has something to show.
 */

export const PIN_SHAPE_BOX = 100;
export type ShapeAnchor = "center" | "bottom";

export const MARKER_FILLS = ["BRAND", "PIN", "NONE"] as const;
export type MarkerFill = (typeof MARKER_FILLS)[number];

/** Image placement inside the shape: zoom ≥ 1, and an offset of up to ±1 (a shape's width). */
export type ImageFit = { zoom: number; x: number; y: number };

/** A star in the 100×100 box: `points` tips, inner corners at `inner` (0–1) of the radius. */
export function starPath(points = 5, inner = 0.45, rounding = 0) {
  const cx = 50;
  const cy = 52;
  const R = 46;
  const r = R * inner;
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return polygonPath(pts, rounding);
}

/** A regular polygon (hexagon = 6), pointy side up. */
export function regularPolygonPath(sides = 6, rounding = 0) {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides - Math.PI / 2;
    pts.push([50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a)]);
  }
  return polygonPath(pts, rounding);
}

const f = (n: number) => String(Math.round(n * 100) / 100);

/** Closed path through `pts`; `rounding` (0–1) softens each corner with a curve. */
export function polygonPath(pts: [number, number][], rounding = 0) {
  if (pts.length < 3) return "";
  if (rounding <= 0) return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L")} Z`;
  const k = Math.min(0.5, rounding / 2);
  const seg = (a: [number, number], b: [number, number], t: number): [number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  let d = "";
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length]!;
    const next = pts[(i + 1) % pts.length]!;
    const a = seg(p, prev, k);
    const b = seg(p, next, k);
    d += `${i === 0 ? "M" : " L"}${f(a[0])} ${f(a[1])} Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`;
  });
  return `${d} Z`;
}

export const BUILTIN_SHAPES = {
  circle: { name: "Circle", path: "M50 4 A46 46 0 1 1 49.99 4 Z", anchor: "center" },
  square: {
    name: "Square",
    path: "M18 4 H82 Q96 4 96 18 V82 Q96 96 82 96 H18 Q4 96 4 82 V18 Q4 4 18 4 Z",
    anchor: "center",
  },
  hexagon: { name: "Hexagon", path: regularPolygonPath(6, 0.18), anchor: "center" },
  shield: {
    name: "Shield",
    path: "M50 4 L92 17 V47 C92 71 74 87 50 96 C26 87 8 71 8 47 V17 Z",
    anchor: "center",
  },
  star: { name: "Star", path: starPath(5, 0.5, 0.25), anchor: "center" },
  teardrop: {
    name: "Teardrop",
    path: "M50 97 C40 84 12 60 12 40 A38 38 0 1 1 88 40 C88 60 60 84 50 97 Z",
    anchor: "bottom",
  },
} as const satisfies Record<string, { name: string; path: string; anchor: ShapeAnchor }>;

export type BuiltinShapeId = keyof typeof BUILTIN_SHAPES;
export const BUILTIN_SHAPE_IDS = Object.keys(BUILTIN_SHAPES) as BuiltinShapeId[];
export const DEFAULT_SHAPE: BuiltinShapeId = "circle";

export const isBuiltinShape = (id: unknown): id is BuiltinShapeId =>
  typeof id === "string" && Object.hasOwn(BUILTIN_SHAPES, id);

// ── Checking a path ─────────────────────────────────────────────────────

/** Numbers each command takes. Only absolute commands are allowed in stored shapes. */
const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};
export const MAX_SHAPE_PATH_LENGTH = 12_000;
/** Most numbers a shape may have (a traced logo can be detailed, but stays fast to draw). */
export const MAX_SHAPE_NUMBERS = 2_400;
const SLACK = 0.5;

export type PathCheck = { ok: true; path: string } | { ok: false; error: string };

/**
 * Whether `d` is a shape we'll store and draw: only absolute path commands
 * and numbers, starts with M, every outline closed with Z, every point inside
 * the 100×100 box, and not too detailed. Returns the path tidied up.
 */
export function checkShapePath(d: unknown): PathCheck {
  if (typeof d !== "string" || !d.trim()) return { ok: false, error: "The shape is empty" };
  if (d.length > MAX_SHAPE_PATH_LENGTH) return { ok: false, error: "The shape is too detailed" };
  if (/[^MLHVCSQTAZ0-9eE.,\s+-]/.test(d))
    return { ok: false, error: "The shape can only use absolute path commands" };

  const tokens = d.match(/[MLHVCSQTAZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  // Everything must be a command or a number (no stray characters between them).
  if (tokens.join("").length !== d.replace(/[\s,]/g, "").length)
    return { ok: false, error: "The shape's outline couldn't be read" };

  let numbers = 0;
  let i = 0;
  let open = false;
  const out: string[] = [];
  const inBox = (n: number) => n >= -SLACK && n <= PIN_SHAPE_BOX + SLACK;
  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    const arity = ARITY[cmd];
    if (arity === undefined) return { ok: false, error: "The shape's outline couldn't be read" };
    if (out.length === 0 && cmd !== "M")
      return { ok: false, error: "The outline must start with a move (M)" };
    if (cmd === "Z") {
      if (!open) return { ok: false, error: "The shape's outline couldn't be read" };
      open = false;
      out.push("Z");
      continue;
    }
    if (cmd !== "M" && !open) return { ok: false, error: "Each outline must start with M" };
    if (cmd === "M") {
      if (open) return { ok: false, error: "Every outline must be closed (Z)" };
      open = true;
    }
    // A command may repeat its numbers (e.g. "L 1 2 3 4").
    const args: number[] = [];
    while (i < tokens.length && !/^[A-Z]$/.test(tokens[i]!)) args.push(Number(tokens[i++]));
    if (args.length === 0 || args.length % arity !== 0 || args.some((n) => !Number.isFinite(n)))
      return { ok: false, error: "The shape's outline couldn't be read" };
    numbers += args.length;
    if (numbers > MAX_SHAPE_NUMBERS) return { ok: false, error: "The shape is too detailed" };
    for (let j = 0; j < args.length; j += arity) {
      const g = args.slice(j, j + arity);
      // Coordinates to check: arcs end on their last two; H/V carry one.
      const coords = cmd === "A" ? [g[5]!, g[6]!] : cmd === "H" || cmd === "V" ? [g[0]!] : g;
      if (!coords.every(inBox)) return { ok: false, error: "The shape goes outside its box" };
      if (cmd === "A" && (g[0]! <= 0 || g[1]! <= 0 || g[0]! > 200 || g[1]! > 200))
        return { ok: false, error: "The shape's outline couldn't be read" };
    }
    out.push(`${cmd}${args.map(f).join(" ")}`);
  }
  if (open) return { ok: false, error: "Every outline must be closed (Z)" };
  return { ok: true, path: out.join(" ") };
}

export const shapePathSchema = z.string().transform((d, ctx) => {
  const r = checkShapePath(d);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.path;
});

// ── What a pin stores, and what the apps draw ───────────────────────────

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a colour");

export const imageFitSchema = z.object({
  zoom: z.number().min(1).max(4),
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
});

/** What the forms send: a built-in shape id or a brand shape's id, and the rest. */
export const pinLookInputSchema = z.object({
  /** A built-in id ("circle"…) or the id of one of the brand's saved shapes. */
  shape: z.string().max(64).nullable().optional(),
  fill: z.enum(MARKER_FILLS).default("BRAND"),
  color: hexColor.nullable().optional(),
  imageFit: imageFitSchema.nullable().optional(),
  autoBadge: z.boolean().default(true),
});
export type PinLookInput = z.input<typeof pinLookInputSchema>;

export const DEFAULT_PIN_LOOK = {
  shape: DEFAULT_SHAPE,
  fill: "BRAND",
  color: null,
  imageFit: null,
  autoBadge: true,
} as const satisfies PinLookInput;

/**
 * The columns a pin look is stored in (on `LocationGroup` and `Hotspot`).
 * A brand's own shape goes in `pinShapeId`, a built-in in `markerShape`.
 */
export type PinLookColumns = {
  markerShape: string | null;
  pinShapeId: string | null;
  markerFill: string;
  markerColor: string | null;
  markerImageFit: unknown;
  markerAutoBadge: boolean;
};

/** Form input → columns. `isBrandShape` says whether `shape` is one of the brand's saved shapes. */
export function lookToColumns(input: PinLookInput | null | undefined, isBrandShape: boolean) {
  const look = pinLookInputSchema.parse(input ?? {});
  const shape = look.shape ?? null;
  return {
    markerShape: shape && !isBrandShape && isBuiltinShape(shape) ? shape : null,
    pinShapeId: shape && isBrandShape ? shape : null,
    markerFill: look.fill,
    markerColor: look.color ?? null,
    markerImageFit: look.imageFit ?? null,
    markerAutoBadge: look.autoBadge,
  } satisfies PinLookColumns;
}

/** Columns → what the form shows (the shape picker takes either kind of id). */
export function columnsToLook(c: Partial<PinLookColumns> | null | undefined): PinLookInput {
  const fit = imageFitSchema.safeParse(c?.markerImageFit);
  return {
    shape: c?.pinShapeId ?? (isBuiltinShape(c?.markerShape) ? c.markerShape : DEFAULT_SHAPE),
    fill: (MARKER_FILLS as readonly string[]).includes(c?.markerFill ?? "")
      ? (c!.markerFill as MarkerFill)
      : "BRAND",
    color: hexColor.safeParse(c?.markerColor).success ? c!.markerColor! : null,
    imageFit: fit.success ? fit.data : null,
    autoBadge: c?.markerAutoBadge ?? true,
  };
}

/** Everything a map needs to draw a pin, already resolved. Sent to the fan apps as `look`. */
export type ResolvedPinLook = {
  path: string;
  anchor: ShapeAnchor;
  /** Shape colour: the fill when there's no image, the outline otherwise. Null = the app's own. */
  color: string | null;
  /** The image inside the shape, or null to fill it with the colour. */
  imageUrl: string | null;
  imageFit: ImageFit | null;
  /** Show the ⚡ badge (only ever true for an auto-collect pin). */
  autoBadge: boolean;
};

/**
 * The look to draw, with every fallback applied:
 * - a brand shape that's missing (or whose path no longer checks out) → the built-in → circle
 * - "pin image" without one → the brand logo → the colour
 */
export function resolvePinLook(
  c: Partial<PinLookColumns> | null | undefined,
  opts: {
    customShape?: { path: string; anchor: string } | null;
    brandImage?: string | null;
    pinImage?: string | null;
    autoCollect: boolean;
  },
): ResolvedPinLook {
  const custom = opts.customShape ? checkShapePath(opts.customShape.path) : null;
  const builtin = isBuiltinShape(c?.markerShape) ? BUILTIN_SHAPES[c.markerShape] : null;
  const customAnchor: ShapeAnchor = opts.customShape?.anchor === "bottom" ? "bottom" : "center";
  const shape: { path: string; anchor: ShapeAnchor } =
    custom?.ok && opts.customShape
      ? { path: custom.path, anchor: customAnchor }
      : (builtin ?? BUILTIN_SHAPES[DEFAULT_SHAPE]);
  const look = columnsToLook(c);
  // An empty string means "no image" too.
  const brand = nonEmpty(opts.brandImage);
  const imageUrl =
    look.fill === "NONE" ? null : look.fill === "PIN" ? (nonEmpty(opts.pinImage) ?? brand) : brand;
  return {
    path: shape.path,
    anchor: shape.anchor,
    color: look.color ?? null,
    imageUrl,
    imageFit: look.imageFit ?? null,
    autoBadge: opts.autoCollect && (look.autoBadge ?? true),
  };
}

const nonEmpty = (s: string | null | undefined) => (s?.length ? s : null);
