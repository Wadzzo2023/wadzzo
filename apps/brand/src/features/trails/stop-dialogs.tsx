"use client";

import { ChevronDown, ExternalLink, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { columnsToLook, type PinLookInput } from "@wadzzo/schemas/pin-look";
import { describeMinutes } from "@wadzzo/schemas/pin-template";
import { NEW_STOP_PREFIX, newStopPinSchema, type StopDefaults } from "@wadzzo/schemas/trail";
import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { cn } from "@wadzzo/ui/lib/cn";
import { Button } from "@wadzzo/ui/poster/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wadzzo/ui/poster/dialog";
import { Input } from "@wadzzo/ui/poster/input";
import { Textarea } from "@wadzzo/ui/poster/textarea";

import { ImageUploadField } from "~/components/pins/pin-form-parts";
import {
  PinLookEditor,
  toLookValue,
  type PinLookValue,
} from "~/features/pins/look/pin-look-section";
import type { PinOnMap } from "~/store/map-stores";

import type { DraftStop, TrailDraft } from "./builder-store";

/** Uncapped, as brands without a limit set it (the fan app hides the "x of y"). */
const NO_LIMIT = 999_999;

const sameLook = (a: PinLookInput, b: PinLookInput) => {
  const x = toLookValue(a);
  const y = toLookValue(b);
  return (
    x.shape === y.shape &&
    x.fill === y.fill &&
    (x.color ?? null) === (y.color ?? null) &&
    x.autoBadge === y.autoBadge
  );
};

/** Whether a pin already looks like the trail's stops (then nobody needs asking). */
export function matchesTrailStyle(pin: PinOnMap, defaults: StopDefaults) {
  if (!defaults.look || !pin.locationGroup) return true;
  return sameLook(columnsToLook(pin.locationGroup), defaults.look);
}

/**
 * The short form for a stop made where the brand clicked (docs/trails, "New stop"): only the
 * title is needed; everything else comes from the trail's Stop defaults, shown collapsed with
 * their values, and can be changed for this stop. The pin is made when the trail is saved
 * and belongs to the trail: taking the stop off (or deleting the trail) removes it.
 */
export function NewStopDialog({
  at,
  draft,
  position,
  onClose,
  onCreated,
}: {
  at: { lat: number; lng: number } | null;
  draft: TrailDraft;
  position: number;
  onClose: () => void;
  onCreated: (stop: DraftStop) => void;
}) {
  const d = draft.stopDefaults;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | undefined>(d.image);
  const [autoCollect, setAutoCollect] = useState(d.autoCollect ?? false);
  const [look, setLook] = useState<PinLookValue>(() => toLookValue(d.look ?? null));
  const [open, setOpen] = useState<"look" | "collect" | null>(null);

  if (!at) return null;
  const now = new Date();
  const start = draft.startDate > now ? draft.startDate : now;
  const limit = d.pinCollectionLimit && d.pinCollectionLimit > 0 ? d.pinCollectionLimit : NO_LIMIT;

  // Nothing is written yet: the pin is made with the trail when it is saved (docs/trails).
  const submit = () => {
    const pin = newStopPinSchema.safeParse({
      lat: at.lat,
      lng: at.lng,
      title: title.trim(),
      description: description.trim() || (d.description ?? ""),
      image,
      url: d.url,
      autoCollect,
      pinCollectionLimit: limit,
      tier: d.tier,
      token: d.token,
      tags: d.tags ?? [],
      look,
    });
    if (!pin.success) {
      toast.error(pin.error.issues[0]?.message ?? "Check the stop's details");
      return;
    }
    onCreated({
      pinId: `${NEW_STOP_PREFIX}${crypto.randomUUID()}`,
      title: pin.data.title,
      lat: at.lat,
      lng: at.lng,
      image: image ?? null,
      required: true,
      clue: null,
      newPin: pin.data,
    });
  };

  const fullForm = `/pins/new?lat=${at.lat.toFixed(6)}&lng=${at.lng.toFixed(6)}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New stop {position}</DialogTitle>
          <DialogDescription>
            A new pin here, set up from the trail&apos;s stop defaults. Only the title is needed. It
            is made when you save the trail, and goes if you take the stop off.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stop-title">Title</Label>
            <Input
              id="stop-title"
              autoFocus
              value={title}
              maxLength={120}
              placeholder="e.g. The old clock tower"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stop-description">Description (optional)</Label>
            <Textarea
              id="stop-description"
              rows={2}
              value={description}
              placeholder={d.description ?? "What fans find here"}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <ImageUploadField value={image} onChange={setImage} />

          <Section
            title="Pin look"
            summary={`${look.shape} · ${look.fill === "BRAND" ? "brand image" : look.fill === "PIN" ? "pin image" : "colour only"}`}
            open={open === "look"}
            onToggle={() => setOpen(open === "look" ? null : "look")}
          >
            <PinLookEditor
              compact
              value={look}
              onChange={setLook}
              autoCollect={autoCollect}
              pinImage={image}
              creatorId={draft.creatorId}
            />
          </Section>
          <Section
            title="Collecting"
            summary={[
              autoCollect ? "auto-collect" : "tap to collect",
              limit >= NO_LIMIT ? "no limit" : `${limit} can collect`,
              `runs until the trail ends (${describeMinutes(Math.max(1, Math.round((draft.endDate.getTime() - start.getTime()) / 60_000)))})`,
            ].join(" · ")}
            open={open === "collect"}
            onToggle={() => setOpen(open === "collect" ? null : "collect")}
          >
            <div className="flex items-center gap-2">
              <Switch id="stop-auto" checked={autoCollect} onCheckedChange={setAutoCollect} />
              <Label htmlFor="stop-auto" className="text-sm">
                Auto-collect when a fan walks up
              </Label>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              The limit, tier and item come from the trail&apos;s stop defaults. For anything else,
              use the full pin form.
            </p>
          </Section>

          <Link
            href={fullForm}
            target="_blank"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs underline"
          >
            Open full pin form <ExternalLink className="size-3" />
          </Link>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Plus />
            Add stop {position}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-foreground/10 rounded-xl border-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-muted-foreground block truncate text-xs">{summary}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-foreground/10 border-t-2 p-3">{children}</div>}
    </div>
  );
}

/**
 * "Use the trail's style?" when an existing pin with another look becomes a stop. Using it
 * changes only the pin's look (shape, fill, colour, badge), everywhere it shows; keeping it
 * leaves the pin as it is, and the stop number still marks it on the trail.
 */
export function UseStyleDialog({
  pin,
  position,
  busy,
  onUse,
  onKeep,
  onCancel,
}: {
  pin: PinOnMap | null;
  position: number;
  busy?: boolean;
  onUse: () => void;
  onKeep: () => void;
  onCancel: () => void;
}) {
  if (!pin) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Use the trail&apos;s style?</DialogTitle>
          <DialogDescription>
            “{pin.locationGroup?.title ?? "This pin"}” looks different from the trail&apos;s other
            stops. Using the trail&apos;s style changes only its look, everywhere it shows. Its
            details and collecting stay the same.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onKeep} disabled={busy}>
            Keep its look
          </Button>
          <Button onClick={onUse} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Use trail style · stop {position}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
