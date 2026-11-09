"use client";

import { BarChart3, Footprints, Maximize2, Pencil, X } from "lucide-react";

import { TRAIL_MODE_LABEL, TRAIL_STATUS_LABEL } from "@wadzzo/schemas/trail";
import { StatusPill } from "@wadzzo/ui/patterns/status-pill";
import { Button } from "@wadzzo/ui/poster/button";

import { api } from "~/utils/api";

import { distanceLabel, STATUS_TONE, trailColor, type TrailView } from "./trail-lines";

/**
 * The card a clicked trail opens on the map: its stops in order, length, time and how fans
 * are doing on it, with Edit (Trail mode) and Fit.
 */
export function TrailCard({
  trail,
  onFit,
  onEdit,
  onClose,
}: {
  trail: TrailView;
  onFit: () => void;
  onEdit?: () => void;
  onClose: () => void;
}) {
  const color = trailColor(trail);
  const stats = api.maps.trail.stats.useQuery(
    { id: trail.id },
    { enabled: trail.status !== "DRAFT", staleTime: 30_000 },
  );
  return (
    <div className="bg-card border-foreground/10 w-full max-w-sm rounded-[1.2rem] border-2 p-3 shadow-lg">
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 size-3 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-hud truncate text-sm font-semibold">{trail.title}</p>
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            {trail.stops.length} stops · {distanceLabel(trail.distanceMetres)} ·
            <Footprints className="size-3" aria-hidden /> {TRAIL_MODE_LABEL[trail.mode]} about{" "}
            {trail.estMinutes} min
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[trail.status]}>{TRAIL_STATUS_LABEL[trail.status]}</StatusPill>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close trail">
          <X />
        </Button>
      </div>

      <ol className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
        {trail.stops.map((s) => (
          <li key={s.pin.id} className="flex items-center gap-2 text-sm">
            <span
              className="font-hud flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white tabular-nums"
              style={{ backgroundColor: s.required ? color : "hsl(var(--muted-foreground))" }}
            >
              {s.position}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.pin.title}</span>
            {!s.required && <span className="text-muted-foreground text-[11px]">optional</span>}
            {stats.data && (
              <span
                className="text-muted-foreground text-[11px] tabular-nums"
                title="Fans on this trail who collected it"
              >
                {stats.data.stops.find((x) => x.position === s.position)?.collected ?? 0}
              </span>
            )}
          </li>
        ))}
      </ol>

      {stats.data && (
        <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
          <BarChart3 className="size-3" aria-hidden /> {stats.data.started} started ·{" "}
          {stats.data.finished} finished
          {trail.reward ? ` · ${stats.data.rewardsClaimed} rewards claimed` : ""}
        </p>
      )}
      {trail.status === "DRAFT" && trail.reviewNote && (
        <p className="tone-warning mt-3 rounded-lg px-2 py-1.5 text-xs">
          Sent back: {trail.reviewNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {onEdit && trail.status !== "ENDED" && (
          <Button size="sm" onClick={onEdit}>
            <Pencil /> Edit trail
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onFit}>
          <Maximize2 /> Fit to trail
        </Button>
      </div>
    </div>
  );
}
