"use client";

import { Controller, useFormContext } from "react-hook-form";

import { LayerBadge } from "@wadzzo/ui/patterns/layer-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wadzzo/ui/poster/select";
import { Field } from "~/ui/form-page";

import { useBrandLayers, type BrandLayer } from "./selected-layer";

const NONE = "__none__";

/** No layer, or one of the brand's layers (docs/layers). Null = No layer. */
export function LayerSelect({
  layers,
  value,
  onChange,
  id,
}: {
  layers: BrandLayer[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  id?: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No layer (regular map)</SelectItem>
        {layers.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            <span className="flex items-center gap-2">
              <LayerBadge icon={l.icon} color={l.color} size={18} />
              {l.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Map layer" on the pin and hotspot forms, bound to the form's `layerId`. Hidden while the
 * brand has no layers (and its value then stays as it was).
 */
export function LayerField({
  creatorId,
  hint = "Fans see it only when they pick this layer's chip above their map.",
}: {
  creatorId?: string;
  hint?: string;
}) {
  const { control } = useFormContext<{ layerId?: string | null }>();
  const layers = useBrandLayers(creatorId);
  const rows = layers.data ?? [];
  if (!rows.length) return null;
  return (
    <Field label="Map layer" htmlFor="map-layer" hint={hint}>
      <Controller
        name="layerId"
        control={control}
        render={({ field }) => (
          <LayerSelect id="map-layer" layers={rows} value={field.value} onChange={field.onChange} />
        )}
      />
    </Field>
  );
}

/**
 * Which layer a new pin, hotspot or trail goes in (docs/layers): the one picked in the map's
 * layer switcher. Read-only; shown only when a layer is picked.
 */
export function LayerNote({
  layerId,
  creatorId,
  what = "pin",
  lead,
}: {
  layerId: string | null | undefined;
  creatorId?: string;
  what?: string;
  /** The words before the layer's name; default "This {what} goes in layer". */
  lead?: string;
}) {
  const layers = useBrandLayers(creatorId);
  const layer = layerId ? layers.data?.find((l) => l.id === layerId) : undefined;
  if (!layer) return null;
  return (
    <div className="border-foreground/10 bg-muted/40 flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-xs">
      <LayerBadge icon={layer.icon} color={layer.color} size={18} />
      <span className="text-muted-foreground">{lead ?? `This ${what} goes in layer`}</span>
      <span className="min-w-0 truncate font-semibold">{layer.name}</span>
    </div>
  );
}
