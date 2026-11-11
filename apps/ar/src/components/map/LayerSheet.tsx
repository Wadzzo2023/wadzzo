"use client";

import { motion } from "framer-motion";
import { Check, Layers, MapPin } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import type { ArMapLayer } from "@wadzzo/ar-core/ar/types";
import { cn } from "@wadzzo/ui/lib/cn";
import { LayerIcon } from "@wadzzo/ui/patterns/layer-icon";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { chipLabels, layersOn, useMapLayer } from "~/lib/ar/layers";

const noSubscribe = () => () => undefined;

/**
 * The map rail's Layers button and its sheet (docs/layers): which drops the map shows. Regular
 * drops, and each brand layer with live drops nearby (its icon, name and brand), ticked on and
 * off; several at once. Select all / Deselect all. The button's badge counts the layers on.
 */
export function LayerSheetButton({
  layers,
  bare = false,
}: {
  layers: ArMapLayer[];
  bare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const on = layersOn(useMapLayer((s) => s.view));
  // Only in the browser (the portal needs the document; the server renders no sheet).
  const client = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return (
    <>
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen(true)}
        aria-label={on ? `Map layers, ${on} on` : "Map layers"}
        title="Map layers"
        className={cn(
          "pointer-events-auto relative flex h-11 w-11 items-center justify-center transition-colors",
          on ? "text-ar-green-hot" : "text-ar-dim hover:text-ar-text",
          !bare && "ar-glass rounded-full",
        )}
      >
        <Layers size={18} strokeWidth={2.1} />
        {on > 0 && (
          <span
            aria-hidden
            className="bg-ar-green-hot font-hud absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-black"
          >
            {on}
          </span>
        )}
      </motion.button>
      {/* Into the phone screen, not here: a sheet fills its nearest positioned box, and the
          map rail (absolute, translated) would squeeze it into the button's capsule. */}
      {client &&
        createPortal(
          <LayerSheet open={open} layers={layers} onClose={() => setOpen(false)} />,
          document.querySelector("[data-ar-app-frame]") ?? document.body,
        )}
    </>
  );
}

export function LayerSheet({
  open,
  layers,
  onClose,
}: {
  open: boolean;
  layers: ArMapLayer[];
  onClose: () => void;
}) {
  const view = useMapLayer((s) => s.view);
  const { toggleRegular, toggleLayer, setAll } = useMapLayer.getState();
  const ids = layers.map((l) => l.id);
  const allOn = view.regular && ids.every((id) => view.layers.includes(id));
  const noneOn = !view.regular && !view.layers.length;
  const label = chipLabels(layers);
  const heading = "font-hud text-ar-faint text-[10px] font-semibold tracking-[0.2em] uppercase";

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="drop-layers-title">
      <div className="flex max-h-[calc(86dvh-2rem)] flex-col px-5 pt-1 pb-3">
        <div className="flex items-center gap-2">
          <h2 id="drop-layers-title" className="font-hud text-ar-text flex-1 text-[16px] font-bold">
            Map layers
          </h2>
          <button
            type="button"
            disabled={allOn}
            onClick={() => setAll(true, ids)}
            className="font-hud text-ar-green-hot rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            disabled={noneOn}
            onClick={() => setAll(false, ids)}
            className="font-hud text-ar-dim hover:text-ar-text rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
          >
            Deselect all
          </button>
        </div>
        <p className="text-ar-dim mt-1 text-[12px]">
          Pick what the map and AR show. Turn on as many layers as you like.
        </p>

        <ul className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pb-1">
          <LayerRow
            on={view.regular}
            onToggle={toggleRegular}
            title="Regular drops"
            subtitle="Drops not in any layer"
            badge={
              <span className="bg-ar-green/20 text-ar-green-hot flex size-9 items-center justify-center rounded-full">
                <MapPin size={17} strokeWidth={2.2} />
              </span>
            }
          />

          {layers.length > 0 && <li className={cn(heading, "px-1 pt-3 pb-0.5")}>Brand layers</li>}
          {layers.map((l) => (
            <LayerRow
              key={l.id}
              on={view.layers.includes(l.id)}
              onToggle={() => toggleLayer(l.id)}
              title={label(l)}
              subtitle={`${l.pinCount} ${l.pinCount === 1 ? "drop" : "drops"} nearby`}
              brand={l.brand}
              brandImage={l.brandImage}
              badge={
                <span
                  className="flex size-9 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: l.color }}
                >
                  <LayerIcon icon={l.icon} size={17} strokeWidth={2.4} />
                </span>
              }
            />
          ))}
        </ul>

        {layers.length === 0 && (
          <p className="text-ar-dim px-1 pt-2 text-[12px]">
            No brand layers near you right now. When brands group their drops (hospitals, schools,
            events…), they show up here.
          </p>
        )}
        {noneOn && (
          <p className="text-ar-dim px-1 pt-2 text-[12px]">
            Nothing is on, so the map shows no drops. Turn on a layer to see them.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

function LayerRow({
  on,
  onToggle,
  title,
  subtitle,
  brand,
  brandImage,
  badge,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  brand?: string;
  brandImage?: string | null;
  badge: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors",
          on
            ? "border-ar-green/50 bg-ar-green/10"
            : "border-ar-line hover:border-ar-line-bright bg-white/[0.03]",
        )}
      >
        {badge}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[14px] font-semibold",
              on ? "text-ar-text" : "text-ar-dim",
            )}
          >
            {title}
          </span>
          <span className="text-ar-faint mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px]">
            {brand && (
              <>
                <BrandAvatar src={brandImage} className="size-4 shrink-0 rounded-full" />
                <span className="text-ar-dim truncate">{brand}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="shrink-0">{subtitle}</span>
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            on ? "border-ar-green-hot bg-ar-green-hot text-black" : "border-ar-line-bright",
          )}
        >
          {on && <Check size={14} strokeWidth={3.2} />}
        </span>
      </button>
    </li>
  );
}
