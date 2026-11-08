"use client";

import { useState } from "react";

import type { PinLookChoice } from "@wadzzo/agent-contract";
import { BUILTIN_SHAPES, isBuiltinShape } from "@wadzzo/schemas/pin-look";
import { PinGlyph } from "@wadzzo/ui/patterns/pin-glyph";

import { api } from "~/utils/api";
import {
  PinLookEditor,
  toLookValue,
  usePinLookGlyph,
  type PinLookValue,
} from "~/features/pins/look/pin-look-section";

/** What the card stores → what the look editor works with. */
const toValue = (choice: PinLookChoice | undefined): PinLookValue => toLookValue(choice ?? null);
const toChoice = (v: PinLookValue): PinLookChoice => ({
  shape: v.shape,
  fill: v.fill,
  color: v.color,
  autoBadge: v.autoBadge,
  imageFit: v.imageFit,
});

/** The shape's name, for saying what the pins will look like. */
function shapeName(value: PinLookValue, glyph: ReturnType<typeof usePinLookGlyph>) {
  if (isBuiltinShape(value.shape)) return BUILTIN_SHAPES[value.shape].name;
  return glyph.custom?.name ?? "Your shape";
}

/**
 * The brand's logo for the previews: the one the chat acts for (an admin's pick), or
 * the signed-in brand's own. Same query the chat itself makes, so it is already loaded.
 */
function useBrandImage(creatorId: string | undefined) {
  const overview = api.agent.overview.useQuery(
    { creatorId },
    { refetchOnWindowFocus: false, retry: false },
  );
  // An admin must never see their own logo while the other brand's loads.
  return overview.data ? overview.data.brand.image : creatorId ? null : undefined;
}

/**
 * The pin shape on an AI proposal's card: how the new pins will look, with a
 * button to change it (the shape, the logo inside, the colour, the ⚡ badge, or a
 * whole new shape drawn in Pin Studio). Until the person changes something, no look
 * is sent and the pins get the brand's default.
 */
export function PinLookRow({
  creatorId,
  value,
  onChange,
  autoCollect,
  pinImage,
  disabled,
}: {
  /** The brand whose shapes to offer (an admin's pick); omitted for the signed-in brand. */
  creatorId?: string;
  /** The look the agent suggested, or none. */
  value: PinLookChoice | undefined;
  onChange: (look: PinLookChoice) => void;
  autoCollect: boolean;
  /** An image the pins will have, if the places come with one. */
  pinImage?: string | null;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const look = toValue(value);
  const brandImage = useBrandImage(creatorId);
  const glyph = usePinLookGlyph(look, { autoCollect, pinImage, creatorId, brandImage });
  const name = shapeName(look, glyph);

  return (
    <div className="border-b px-3 py-2">
      <div className="flex items-center gap-2.5">
        <PinGlyph
          path={glyph.path}
          size={34}
          color={glyph.color}
          defaultColor="hsl(var(--muted))"
          imageUrl={glyph.imageUrl}
          imageFit={look.imageFit}
          ringColor="hsl(var(--primary))"
          ringWidth={2}
          badge={glyph.badge}
        />
        <p className="min-w-0 flex-1 text-xs">
          <span className="text-muted-foreground">Pin shape </span>
          <span className="font-medium">{name}</span>
          {!value && <span className="text-muted-foreground"> (default)</span>}
        </p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          className="text-primary shrink-0 text-xs font-medium hover:underline disabled:opacity-50"
        >
          {open ? "Done" : "Change"}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <PinLookEditor
            compact
            value={look}
            onChange={(next) => onChange(toChoice(next))}
            autoCollect={autoCollect}
            pinImage={pinImage}
            creatorId={creatorId}
            brandImage={brandImage}
          />
        </div>
      )}
    </div>
  );
}

/** A small "this shape" mark with its name, for proposals that change an existing look. */
export function LookChip({ look, creatorId }: { look: PinLookChoice; creatorId?: string }) {
  const value = toValue(look);
  const brandImage = useBrandImage(creatorId);
  const glyph = usePinLookGlyph(value, { autoCollect: true, creatorId, brandImage });
  const name = shapeName(value, glyph);
  return (
    <span className="inline-flex items-center gap-1.5">
      <PinGlyph
        path={glyph.path}
        size={22}
        color={glyph.color}
        defaultColor="hsl(var(--muted))"
        imageUrl={glyph.imageUrl}
        imageFit={value.imageFit}
        ringColor="hsl(var(--primary))"
        ringWidth={1.5}
      />
      {name}
    </span>
  );
}
