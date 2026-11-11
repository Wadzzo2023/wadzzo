"use client";

import { Check, ChevronDown, Eye, EyeOff, Layers, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { cn } from "@wadzzo/ui/lib/cn";
import { LayerBadge } from "@wadzzo/ui/patterns/layer-icon";
import { Button } from "@wadzzo/ui/poster/button";
import { Popover, PopoverContent, PopoverTrigger } from "@wadzzo/ui/poster/popover";

import { describeCounts, LayerDialog } from "./layer-dialog";
import { REGULAR, useBrandLayers, useSelectedLayer, type BrandLayer } from "./selected-layer";

/**
 * The base map's layer switcher (docs/layers): No layer (the regular map) or one of the brand's
 * layers. With a layer picked the map shows only what's in it, and new pins, hotspots and
 * trails go in it. Each layer can be edited here, and New layer makes one and picks it.
 */
export function LayerSwitcher({
  className,
  creatorId,
}: {
  className?: string;
  /** An admin acting for a brand (Admin › All maps): that brand's layers. */
  creatorId?: string;
}) {
  const [open, setOpen] = useState(false);
  // undefined: no dialog; null: New layer; a layer: editing it.
  const [dialog, setDialog] = useState<BrandLayer | null | undefined>(undefined);
  const selected = useSelectedLayer((s) => s.id);
  const select = useSelectedLayer((s) => s.set);
  const shown = useSelectedLayer((s) => s.shown);
  const toggleShown = useSelectedLayer((s) => s.toggleShown);
  const list = useBrandLayers(creatorId);
  const rows = list.data ?? [];
  const current = rows.find((l) => l.id === selected) ?? null;
  // Others on with their eye (not counting the one the brand is in).
  const alsoShown = shown.filter((k) => k !== (selected ?? REGULAR)).length;

  /** The eye: show this layer's drops too (always on for the one the brand is in). */
  const eye = (key: string, name: string) => {
    const inIt = key === (selected ?? REGULAR);
    const on = inIt || shown.includes(key);
    return (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={inIt}
        aria-pressed={on}
        aria-label={
          inIt ? `${name}: you're in this layer` : on ? `Hide ${name}` : `Show ${name} too`
        }
        title={inIt ? "You're in this layer: always shown" : on ? "Hide" : "Show on the map too"}
        className={cn(
          "shrink-0",
          on ? "text-primary" : "text-muted-foreground",
          inIt && "opacity-100",
        )}
        onClick={() => toggleShown(key)}
      >
        {on ? <Eye /> : <EyeOff />}
      </Button>
    );
  };

  const pick = (id: string | null) => {
    select(id);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(className, current && "border-2")}
            style={current ? { borderColor: current.color } : undefined}
            aria-label={current ? `Map layer: ${current.name}` : "Map layer: none"}
          >
            {current ? (
              <LayerBadge icon={current.icon} color={current.color} size={20} />
            ) : (
              <Layers />
            )}
            <span className="hidden max-w-32 truncate sm:inline">
              {current ? current.name : "No layer"}
            </span>
            {alsoShown > 0 && (
              <span
                className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] leading-4 font-semibold"
                aria-label={`and ${alsoShown} more shown`}
              >
                +{alsoShown}
              </span>
            )}
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(92vw,340px)] p-1.5">
          <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] leading-snug">
            Pick the layer you work in: new drops go there. Turn on{" "}
            <Eye className="inline size-3" aria-hidden /> to see other layers too.
          </p>
          <div className="flex items-center gap-1">
            {eye(REGULAR, "the regular map")}
            <button
              type="button"
              className="hover:bg-accent flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left"
              onClick={() => pick(null)}
            >
              <span className="bg-muted flex size-[26px] shrink-0 items-center justify-center rounded-full">
                <Layers className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">No layer</span>
                <span className="text-muted-foreground block text-xs">Your regular map</span>
              </span>
              {selected === null && <Check className="size-4" />}
            </button>
          </div>

          {list.isLoading ? (
            <p className="text-muted-foreground p-3 text-sm">Loading layers…</p>
          ) : list.isError ? (
            <p className="text-destructive p-3 text-sm">Couldn&apos;t load your layers.</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground p-3 text-xs">
              Layers group drops by kind (Hospitals, Schools…). Fans see a layer only when they pick
              its chip above their map.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {rows.map((l) => (
                <li key={l.id} className="group flex items-center gap-1">
                  {eye(l.id, l.name)}
                  <button
                    type="button"
                    className="hover:bg-accent flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left"
                    onClick={() => pick(l.id)}
                  >
                    <LayerBadge icon={l.icon} color={l.color} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {l.pins + l.hotspots + l.trails ? describeCounts(l) : "Empty"}
                      </span>
                    </span>
                    {selected === l.id && <Check className="size-4" />}
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${l.name}`}
                    onClick={() => {
                      setOpen(false);
                      setDialog(l);
                    }}
                  >
                    <Pencil />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="hover:bg-accent mt-1 flex w-full items-center gap-2 rounded-xl border-t px-3 pt-2.5 pb-2 text-left text-sm font-medium"
            onClick={() => {
              setOpen(false);
              setDialog(null);
            }}
          >
            <Plus className="size-4" /> New layer
          </button>
        </PopoverContent>
      </Popover>

      {dialog !== undefined && (
        <LayerDialog
          key={dialog?.id ?? "new"}
          creatorId={creatorId}
          layer={dialog ?? undefined}
          onClose={() => setDialog(undefined)}
          onSaved={(l) => {
            setDialog(undefined);
            // A new layer is picked straight away, so what's made next goes in it.
            if (!dialog) select(l.id);
          }}
          onDeleted={(id) => {
            setDialog(undefined);
            if (selected === id) select(null);
            if (shown.includes(id)) toggleShown(id);
          }}
        />
      )}
    </>
  );
}
