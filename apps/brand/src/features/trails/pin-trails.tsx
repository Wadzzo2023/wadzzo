"use client";

import { Plus, Route } from "lucide-react";
import Link from "next/link";

import { TRAIL_STATUS_LABEL, type TrailStatus } from "@wadzzo/schemas/trail";
import { Button } from "@wadzzo/ui/poster/button";

import { api } from "~/utils/api";

import { useTrailBuilder } from "./builder-store";
import { blankDraft } from "./trail-lines";

/**
 * On a pin's card: the trails it is a stop on ("Stop 2 · Coffee trail"), and "New trail from
 * this pin" (Trail mode with it as stop 1). Hotspot drops can't be stops, so they get neither.
 */
export function PinTrails({
  pin,
  canStart,
  onStart,
}: {
  pin: {
    latitude: number;
    longitude: number;
    group: { id: string; title: string; image: string | null; hotspotId: string | null };
  };
  /** Offer "New trail from this pin" (the brand's own map). */
  canStart: boolean;
  /** Called after Trail mode opens (close the card). */
  onStart: () => void;
}) {
  const trails = api.maps.trail.trailsForPin.useQuery(
    { pinId: pin.group.id },
    { enabled: !pin.group.hotspotId },
  );
  if (pin.group.hotspotId) return null;
  const list = trails.data ?? [];
  if (!list.length && !canStart) return null;

  const start = () => {
    useTrailBuilder.getState().open({
      ...blankDraft(),
      stops: [
        {
          pinId: pin.group.id,
          title: pin.group.title,
          lat: pin.latitude,
          lng: pin.longitude,
          image: pin.group.image,
          required: true,
          clue: null,
        },
      ],
    });
    onStart();
  };

  return (
    <div className="bg-card border-foreground/10 rounded-[1.4rem] border-2 p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Route className="size-4" aria-hidden />
        {list.length ? `On ${list.length} trail${list.length === 1 ? "" : "s"}` : "Trails"}
      </p>
      {list.length > 0 && (
        <ul className="mt-2 space-y-1">
          {list.map((t) => (
            <li key={t.id}>
              <Link
                href={`/pins?trail=${t.id}`}
                className="hover:bg-surface-2 flex items-center gap-2 rounded-md px-1 py-0.5 text-xs"
              >
                <span
                  className="font-hud flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: t.color ?? "hsl(var(--primary))" }}
                >
                  {t.position}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="text-muted-foreground">
                  {TRAIL_STATUS_LABEL[t.status as TrailStatus]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canStart && (
        <Button size="sm" variant="outline" className="mt-2" onClick={start}>
          <Plus /> New trail from this pin
        </Button>
      )}
    </div>
  );
}
