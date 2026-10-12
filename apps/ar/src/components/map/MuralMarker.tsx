import { Check } from "lucide-react";
import { useState } from "react";

import type { MuralCard } from "~/lib/murals/constants";
import { cn } from "@wadzzo/ui/lib/cn";

export type MapMural = MuralCard & { scansToday: number };

/**
 * ── MuralMarker ────────────────────────────────────────────────────────────
 *
 * The third shape in the map's marker language (plan §7): round = tap to
 * collect, square = auto-collect, **portrait frame = scan with the Murals
 * camera**. It shows the mural's own cover, so a street of murals reads as a
 * street of pictures rather than a row of identical pins.
 *
 *   approved            100%, solid epic ring
 *   unverified          60%, dashed ring, "?" — DISCOVERED and PENDING alike
 *   at today's limit    80%, gold tick
 */
export function MuralMarker({
  mural,
  dailyLimit,
  selected,
  onSelect,
}: {
  mural: MapMural;
  dailyLimit: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const verified = mural.status === "APPROVED";
  const done = mural.scansToday >= dailyLimit;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-label={`${mural.title} — ${verified ? "mural" : "unverified mural"}`}
      className={cn(
        "group relative flex h-[62px] w-[46px] cursor-pointer flex-col items-center focus-visible:outline-hidden",
        done ? "opacity-80" : !verified && "opacity-60",
        selected && "!opacity-100",
      )}
    >
      <span
        className={cn(
          "bg-ar-surface relative block h-[52px] w-[42px] overflow-hidden rounded-[9px] border-[2.5px] transition-transform duration-200",
          verified ? "border-rarity-epic" : "border-rarity-epic/90 border-dashed",
          selected
            ? "-translate-y-1 scale-110 shadow-[0_0_18px_hsl(var(--rarity-epic)/0.75)]"
            : "group-hover:-translate-y-0.5",
        )}
      >
        {!failed && (
          // eslint-disable-next-line @next/next/no-img-element -- S3 URL, tiny, many on screen
          <img
            src={mural.coverUrl}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </span>

      {!verified && (
        <span className="font-hud bg-rarity-epic absolute -top-1 -right-1 flex h-[16px] w-[16px] items-center justify-center rounded-full border border-white/70 text-[10px] font-bold text-white">
          ?
        </span>
      )}
      {done && (
        <span className="bg-gold text-ar-void absolute -top-1 -left-1 flex h-[16px] w-[16px] items-center justify-center rounded-full border border-white/70">
          <Check size={10} strokeWidth={3.5} />
        </span>
      )}

      {/* Ground shadow, like the pin medallions. */}
      <span
        aria-hidden
        className="mt-[3px] h-[5px] w-[26px] rounded-[50%] bg-black/35 blur-[2px]"
      />
    </button>
  );
}
