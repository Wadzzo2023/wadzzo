"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import {
  LAYER_COLORS,
  LAYER_ICONS,
  layerFieldsSchema,
  type LayerIcon as LayerIconName,
} from "@wadzzo/schemas/layer";
import { Label } from "@wadzzo/ui/components/label";
import { cn } from "@wadzzo/ui/lib/cn";
import { LayerBadge, LayerIcon } from "@wadzzo/ui/patterns/layer-icon";
import { Button } from "@wadzzo/ui/poster/button";
import { ConfirmDialog } from "@wadzzo/ui/poster/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wadzzo/ui/poster/dialog";
import { Input } from "@wadzzo/ui/poster/input";
import { api } from "~/utils/api";

import type { BrandLayer } from "./selected-layer";

/**
 * New layer, or edit one (docs/layers): name, icon and colour. Editing can also delete it; its
 * pins, hotspots and trails then become regular ones. Render it with a `key` per layer so the
 * fields start from that layer.
 */
export function LayerDialog({
  layer,
  creatorId,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** The layer being edited; absent for a new one. */
  layer?: BrandLayer;
  creatorId?: string;
  onClose: () => void;
  onSaved: (layer: { id: string; name: string }) => void;
  onDeleted?: (id: string) => void;
}) {
  const [name, setName] = useState(layer?.name ?? "");
  const [icon, setIcon] = useState<string>(layer?.icon ?? "MapPin");
  const [color, setColor] = useState(layer?.color ?? LAYER_COLORS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const utils = api.useUtils();

  const refresh = () =>
    Promise.all([
      utils.maps.layer.list.invalidate(),
      utils.maps.pin.getMyPins.invalidate(),
      utils.maps.pin.myHotspots.invalidate(),
      utils.maps.pin.getCreatorPins.invalidate(),
      utils.maps.pin.getCreatorHotspots.invalidate(),
      utils.maps.pin.getLocationGroups.invalidate(),
      utils.maps.trail.list.invalidate(),
    ]);
  const create = api.maps.layer.create.useMutation({ onError: (e) => toast.error(e.message) });
  const update = api.maps.layer.update.useMutation({ onError: (e) => toast.error(e.message) });
  const remove = api.maps.layer.delete.useMutation({ onError: (e) => toast.error(e.message) });
  const busy = create.isPending || update.isPending || remove.isPending;

  const save = async () => {
    const fields = layerFieldsSchema.safeParse({ name, icon, color });
    if (!fields.success) {
      toast.error(fields.error.issues[0]?.message ?? "Check the layer's name");
      return;
    }
    try {
      const saved = layer
        ? await update.mutateAsync({ ...fields.data, id: layer.id })
        : await create.mutateAsync({ ...fields.data, creatorId });
      await utils.maps.layer.list.invalidate();
      toast.success(layer ? "Layer saved" : `Layer "${saved.name}" made. New drops go in it.`);
      onSaved(saved);
    } catch {
      // shown by onError
    }
  };

  const del = async () => {
    if (!layer) return;
    try {
      await remove.mutateAsync({ id: layer.id });
      void refresh();
      setConfirmDelete(false);
      toast.success("Layer deleted. What was in it is on the regular map again.");
      onDeleted?.(layer.id);
    } catch {
      // shown by onError
    }
  };

  const inIt = layer ? layer.pins + layer.hotspots + layer.trails : 0;

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <LayerBadge icon={icon} color={color} size={32} />
              {layer ? "Edit layer" : "New layer"}
            </DialogTitle>
            <DialogDescription>
              Fans see it as a chip above their map. Tapping it shows only this layer&apos;s pins,
              hotspots and trails.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="layer-name">Name</Label>
              <Input
                id="layer-name"
                value={name}
                maxLength={32}
                placeholder="e.g. Hospitals"
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Icon</legend>
              <div className="grid grid-cols-8 gap-1">
                {LAYER_ICONS.map((i: LayerIconName) => (
                  <button
                    key={i}
                    type="button"
                    title={i}
                    aria-label={i}
                    aria-pressed={icon === i}
                    onClick={() => setIcon(i)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border border-transparent transition-colors",
                      icon === i ? "text-white" : "hover:bg-accent text-muted-foreground",
                    )}
                    style={icon === i ? { backgroundColor: color } : undefined}
                  >
                    <LayerIcon icon={i} size={16} />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Colour</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {LAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    aria-pressed={color.toLowerCase() === c.toLowerCase()}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-7 rounded-full border-2 border-white shadow-sm",
                      color.toLowerCase() === c.toLowerCase() &&
                        "ring-foreground ring-2 ring-offset-1",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="relative size-7 cursor-pointer" title="Pick any colour">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    aria-label="Pick any colour"
                  />
                  <span className="flex size-7 items-center justify-center rounded-full border-2 border-dashed text-xs">
                    <Plus className="size-3.5" />
                  </span>
                </label>
              </div>
            </fieldset>

            <DialogFooter className="gap-2 sm:justify-between">
              {layer ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {(create.isPending || update.isPending) && <Loader2 className="animate-spin" />}
                  {layer ? "Save" : "Make layer"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${layer?.name ?? ""}"?`}
        description={
          inIt
            ? `Its ${describeCounts(layer!)} stay on the map as regular ones. Fans lose the chip.`
            : "It's empty. Fans lose the chip."
        }
        busy={remove.isPending}
        onConfirm={() => void del()}
      />
    </>
  );
}

/** "3 pins, 1 hotspot and 2 trails". */
export function describeCounts(l: { pins: number; hotspots: number; trails: number }) {
  const parts = (
    [
      [l.pins, "pin"],
      [l.hotspots, "hotspot"],
      [l.trails, "trail"],
    ] as const
  )
    .filter(([n]) => n > 0)
    .map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`);
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
