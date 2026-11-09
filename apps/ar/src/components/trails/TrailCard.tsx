"use client";

import { Footprints, Gift } from "lucide-react";
import Link from "next/link";

import { distanceLabel, trailColor, type FanTrail } from "~/lib/ar/trails";

import { TrailShape } from "./TrailShape";

const MODE = { WALK: "Walk", BIKE: "Bike", DRIVE: "Drive" } as Record<string, string>;

/** One trail in a list: its shape, brand, size and (once started) how far along you are. */
export function TrailCard({ trail }: { trail: FanTrail }) {
  const color = trailColor(trail);
  const { done, total, complete } = trail.progress;
  return (
    <Link
      href={`/trails/${trail.id}`}
      className="ar-bevel rounded-ar flex items-center gap-3 p-3 transition-transform active:scale-[0.99]"
    >
      <TrailShape trail={trail} className="size-16" />
      <div className="min-w-0 flex-1">
        <p className="text-ar-faint truncate text-[10.5px] tracking-[0.12em] uppercase">
          {trail.brand.name}
        </p>
        <p className="font-hud text-ar-text truncate text-[14px] font-bold">{trail.title}</p>
        <p className="text-ar-dim flex items-center gap-1 text-[11.5px]">
          <Footprints size={11} /> {MODE[trail.mode] ?? trail.mode} · {total} stops ·{" "}
          {distanceLabel(trail.distanceMetres)}
          {trail.reward && (
            <>
              {" "}
              · <Gift size={11} className="text-ar-green-hot" />
            </>
          )}
        </p>
        {trail.run && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }}
              />
            </div>
            <span className="font-hud text-ar-dim text-[10px] font-semibold tabular-nums">
              {complete ? "DONE" : `${done}/${total}`}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
