"use client";

import { Image as ImageIcon, Pencil, RotateCcw, Shapes } from "lucide-react";
import { useRef, useState } from "react";

import {
  BUILTIN_SHAPES,
  DEFAULT_PIN_LOOK,
  isBuiltinShape,
  type MarkerFill,
  type PinLookInput,
} from "@wadzzo/schemas/pin-look";
import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { cn } from "@wadzzo/ui/lib/cn";
import { PinGlyph } from "@wadzzo/ui/patterns/pin-glyph";
import { RangeField } from "@wadzzo/ui/patterns/range-field";
import { Segmented } from "@wadzzo/ui/patterns/segmented";

import { api } from "~/utils/api";
import { FormSection } from "~/ui/form-page";

import { ShapeStudio } from "../studio/shape-studio";
import { ShapePicker } from "./shape-picker";

/** A look with every field present, as the section works with it. */
export type PinLookValue = {
  shape: string;
  fill: MarkerFill;
  color: string | null;
  imageFit: { zoom: number; x: number; y: number } | null;
  autoBadge: boolean;
};

export const DEFAULT_LOOK: PinLookValue = { ...DEFAULT_PIN_LOOK };

/** Fills in any missing field (a template or an old pin may leave some out). */
export function toLookValue(l: PinLookInput | null | undefined): PinLookValue {
  return {
    shape: l?.shape ?? DEFAULT_LOOK.shape,
    fill: l?.fill ?? DEFAULT_LOOK.fill,
    color: l?.color ?? null,
    imageFit: l?.imageFit ?? null,
    autoBadge: l?.autoBadge ?? true,
  };
}

// The brand's last choice becomes the starting look of its next pin (this browser only).
const LAST_KEY = "wadzzo.pin-look.last";
export function loadLastLook(): PinLookValue {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    return raw ? toLookValue(JSON.parse(raw) as PinLookInput) : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}
export function saveLastLook(look: PinLookValue) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(look));
  } catch {
    // storage blocked: the next pin starts from the default
  }
}

const SWATCHES = [
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#111827",
];

const STATES = [
  { label: "Active", ring: "hsl(var(--primary))", className: "" },
  { label: "All collected", ring: "hsl(var(--info))", className: "opacity-80" },
  { label: "Expired", ring: "hsl(var(--muted-foreground))", className: "opacity-40 grayscale" },
] as const;

/**
 * How a look draws right now: its outline, where it touches the map, and what
 * fills it. Pin look's preview and the form's location map both use this, so
 * they always show the same pin.
 */
export function usePinLookGlyph(
  value: PinLookValue,
  {
    autoCollect,
    pinImage,
    creatorId,
    brandImage: brandImageOverride,
  }: {
    autoCollect: boolean;
    pinImage?: string | null;
    creatorId?: string;
    brandImage?: string | null;
  },
) {
  const me = api.fan.creator.meCreator.useQuery(undefined, {
    enabled: brandImageOverride === undefined,
    staleTime: 5 * 60_000,
  });
  const shapes = api.maps.shape.list.useQuery(creatorId ? { creatorId } : undefined, {
    staleTime: 60_000,
  });
  const brandImage =
    brandImageOverride !== undefined ? brandImageOverride : (me.data?.profileUrl ?? null);

  const custom = shapes.data?.find((s) => s.id === value.shape);
  const builtin = isBuiltinShape(value.shape) ? BUILTIN_SHAPES[value.shape] : null;
  const path = builtin?.path ?? custom?.path ?? BUILTIN_SHAPES.circle.path;
  const anchor: "center" | "bottom" =
    (builtin?.anchor ?? custom?.anchor) === "bottom" ? "bottom" : "center";
  const imageUrl =
    value.fill === "NONE"
      ? null
      : value.fill === "PIN"
        ? pinImage?.length
          ? pinImage
          : brandImage
        : brandImage;
  return {
    shapes,
    brandImage,
    custom,
    missingCustom: !builtin && !custom && shapes.isSuccess,
    path,
    anchor,
    imageUrl,
    color: value.color ?? null,
    badge: autoCollect && value.autoBadge,
  };
}

/** The pin as it will sit on the map, and where it touches it, for a form's location picker. */
export function usePinLookMarker(value: PinLookValue, opts: Parameters<typeof usePinLookGlyph>[1]) {
  const g = usePinLookGlyph(value, opts);
  const marker = (
    <PinGlyph
      path={g.path}
      size={44}
      color={g.color}
      defaultColor="hsl(var(--muted))"
      imageUrl={g.imageUrl}
      imageFit={value.imageFit}
      ringColor="hsl(var(--primary))"
      ringWidth={2.5}
      badge={g.badge}
      className="drop-shadow-md"
    />
  );
  return { marker, anchor: g.anchor };
}

type PinLookProps = {
  value: PinLookValue;
  onChange: (next: PinLookValue) => void;
  autoCollect: boolean;
  /** The pin's own image, if it has one yet. */
  pinImage?: string | null;
  /** An admin working for a brand: whose shapes to offer. */
  creatorId?: string;
  /** The brand's logo when it isn't the signed-in brand (admin). */
  brandImage?: string | null;
};

/** "Pin look" as a form section. */
export function PinLookSection(props: PinLookProps) {
  return (
    <FormSection
      title="Pin look"
      icon={Shapes}
      description="How the pin shows on the map. Fans see exactly this."
    >
      <PinLookEditor {...props} />
    </FormSection>
  );
}

/**
 * The shape, what fills it, the colour, how the image sits, and the ⚡ badge,
 * with a live preview of the marker as fans will see it. Used by the pin forms
 * and by the AI pin builder's card.
 */
export function PinLookEditor({
  value,
  onChange,
  autoCollect,
  pinImage,
  creatorId,
  brandImage: brandImageOverride,
  compact = false,
}: PinLookProps & {
  /** A smaller preview, for narrow places such as a chat card. */
  compact?: boolean;
}) {
  const { shapes, brandImage, custom, missingCustom, path, imageUrl, color, badge } =
    usePinLookGlyph(value, { autoCollect, pinImage, creatorId, brandImage: brandImageOverride });

  const set = (patch: Partial<PinLookValue>) => onChange({ ...value, ...patch });
  // Pin Studio opens over the form, so nothing filled in here is lost.
  const [studio, setStudio] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });

  const fit = value.imageFit ?? { zoom: 1, x: 0, y: 0 };

  // Drag the big preview to move the image inside the shape (once zoomed in).
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const PREVIEW = compact ? 72 : 120;
  const onPointerDown = (e: React.PointerEvent) => {
    if (!imageUrl || fit.zoom <= 1) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, fx: fit.x, fy: fit.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const room = (fit.zoom - 1) * 50; // box units the image can move each way
    const perPx = 100 / PREVIEW / room;
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    set({
      imageFit: {
        zoom: fit.zoom,
        x: clamp(d.fx + (e.clientX - d.x) * perPx),
        y: clamp(d.fy + (e.clientY - d.y) * perPx),
      },
    });
  };
  const endDrag = () => (drag.current = null);

  const fillOptions = [
    { id: "BRAND", label: "Brand logo" },
    {
      id: "PIN",
      label: "Pin image",
      disabled: !pinImage,
      title: pinImage ? undefined : "Add a cover image to this pin to use it here",
    },
    { id: "NONE", label: "None" },
  ] as const;
  const fillHint = {
    BRAND: "Your profile image",
    PIN: "This pin's cover image",
    NONE: "Just the shape",
  };

  return (
    <div className={cn("grid gap-5", !compact && "md:grid-cols-[13rem_minmax(0,1fr)]")}>
      {/* Preview: stays in view beside the controls, so every change shows at once */}
      <div
        className={cn(
          "bg-surface-2 flex items-center gap-5 self-start rounded-2xl border p-4",
          !compact && "md:sticky md:top-4 md:flex-col md:gap-4",
        )}
      >
        <div
          className={cn(
            "relative shrink-0 touch-none select-none",
            imageUrl && fit.zoom > 1 && "cursor-grab active:cursor-grabbing",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={imageUrl && fit.zoom > 1 ? "Drag to move the image" : undefined}
        >
          <PinGlyph
            path={path}
            size={PREVIEW}
            color={color}
            defaultColor="hsl(var(--muted))"
            imageUrl={imageUrl}
            imageFit={value.imageFit}
            ringColor="hsl(var(--primary))"
            ringWidth={3}
            badge={badge}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex items-end gap-3">
            {STATES.map((st) => (
              <div key={st.label} className="flex flex-col items-center gap-1">
                <PinGlyph
                  path={path}
                  size={36}
                  color={color}
                  defaultColor="hsl(var(--muted))"
                  imageUrl={imageUrl}
                  imageFit={value.imageFit}
                  ringColor={st.ring}
                  badge={badge && st.label === "Active"}
                  className={st.className}
                />
                <span className="text-muted-foreground text-[10px]">{st.label}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">What fans see on the map.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="min-w-0 space-y-5">
        {missingCustom && (
          <p className="text-warning text-xs">
            This pin&apos;s shape isn&apos;t available any more — it shows as a circle. Choose
            another.
          </p>
        )}

        <ControlGroup title="Shape">
          <ShapePicker
            value={value.shape}
            own={shapes.data ?? []}
            onChange={(shape) => set({ shape })}
            onNew={() => setStudio({ open: true, editId: null })}
            onEdit={(id) => setStudio({ open: true, editId: id })}
            color={color}
            imageUrl={imageUrl}
          />
          {custom && (
            <button
              type="button"
              onClick={() => setStudio({ open: true, editId: custom.id })}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
            >
              <Pencil className="size-3" /> Edit “{custom.name}” in Pin Studio
            </button>
          )}
        </ControlGroup>

        <ControlGroup title="Picture inside" hint={fillHint[value.fill]}>
          <Segmented
            label="Picture inside the shape"
            value={value.fill}
            options={fillOptions}
            onChange={(fill) => set({ fill })}
          />
          {imageUrl && (
            <RangeField
              label={
                <span className="flex items-center gap-1.5 text-xs">
                  <ImageIcon className="size-3.5" /> Zoom the picture
                </span>
              }
              action={
                value.imageFit && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                    onClick={() => set({ imageFit: null })}
                  >
                    <RotateCcw className="size-3" /> Reset
                  </button>
                )
              }
              min={1}
              max={3}
              step={0.05}
              value={fit.zoom}
              onChange={(zoom) =>
                set({ imageFit: zoom <= 1 ? null : { zoom, x: fit.x, y: fit.y } })
              }
              left="Fit"
              right="Zoomed in — drag the preview to move it"
            />
          )}
        </ControlGroup>

        <ControlGroup title="Colour" hint={imageUrl ? "Colours the outline" : "Colours the shape"}>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => set({ color: null })}
              className={cn(
                "h-6 rounded-full border px-2.5 text-xs",
                value.color === null ? "border-primary bg-primary/10" : "hover:border-line-bright",
              )}
            >
              Default
            </button>
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={value.color === c}
                onClick={() => set({ color: c })}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform hover:scale-110",
                  value.color === c
                    ? "border-foreground ring-primary/40 ring-2"
                    : "border-white/70",
                )}
                style={{ background: c }}
              />
            ))}
            <label
              title="Custom colour"
              className={cn(
                "relative block size-6 cursor-pointer overflow-hidden rounded-full border-2 transition-transform hover:scale-110",
                value.color && !SWATCHES.includes(value.color)
                  ? "border-foreground ring-primary/40 ring-2"
                  : "border-white/70",
              )}
              style={{
                background:
                  value.color && !SWATCHES.includes(value.color)
                    ? value.color
                    : "conic-gradient(#ef4444, #eab308, #22c55e, #0ea5e9, #a855f7, #ef4444)",
              }}
            >
              <span className="sr-only">Custom colour</span>
              <input
                type="color"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                value={value.color ?? "#22c55e"}
                onChange={(e) => set({ color: e.target.value.toLowerCase() })}
              />
            </label>
          </div>
        </ControlGroup>

        <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div>
            <Label htmlFor="look-badge" className="text-sm font-semibold">
              ⚡ Auto-collect badge
            </Label>
            <p className="text-muted-foreground text-xs">
              {autoCollect
                ? "Lets fans tell auto-collect pins apart."
                : "Only shown on auto-collect pins."}
            </p>
          </div>
          <Switch
            id="look-badge"
            checked={autoCollect && value.autoBadge}
            disabled={!autoCollect}
            onCheckedChange={(c) => set({ autoBadge: c })}
          />
        </div>
      </div>

      <ShapeStudio
        open={studio.open}
        onOpenChange={(o) => setStudio((st) => ({ ...st, open: o }))}
        editing={studio.editId ? (shapes.data?.find((x) => x.id === studio.editId) ?? null) : null}
        creatorId={creatorId}
        brandImage={brandImage}
        onSaved={(shape) => set({ shape: shape.id })}
      />
    </div>
  );
}

/** A labelled group of controls in the pin look editor. */
function ControlGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
