import { memo, useState } from "react";

import { cn } from "@wadzzo/ui/lib/cn";

const W = 66;
const H = 58;
const PAD = 4;
const GAP = 3;

/** Same optimizer the mobile app's tiles use: a 96 px thumbnail, not the original. */
const thumb = (url: string) => `/_next/image?url=${encodeURIComponent(url)}&w=96&q=70`;

/**
 * ── ClusterBillboard ───────────────────────────────────────────────────────
 *
 * Web port of the mobile app's ClusterBillboard. A group of nearby drops,
 * drawn as a little roadside billboard: a card on a post with a bento of the
 * brands inside (1 → full panel, 2 → split, 3 → one tall + two stacked,
 * 4 → 2×2), and the drop count on a badge. Click to zoom in until it opens
 * up into its pins. Anchored at the foot of the post.
 *
 * `tone="mural"`: the same billboard for a group of murals — epic purple,
 * showing their covers.
 */
export const ClusterBillboard = memo(function ClusterBillboard({
  id,
  count,
  images,
  onOpen,
  tone = "drop",
}: {
  id: number;
  count: number;
  /** Up to 4 distinct images from inside the cluster. */
  images: string[];
  onOpen: (id: number) => void;
  tone?: "drop" | "mural";
}) {
  const mural = tone === "mural";
  const accent = mural ? "var(--rarity-epic)" : "var(--ar-green)";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(id);
      }}
      aria-label={`${count} ${mural ? "murals" : "drops"} here. Zoom in`}
      className="group relative flex flex-col items-center"
      style={{ width: W + 16, height: H + 26 }}
    >
      {/* Ground shadow + post. */}
      <span className="absolute bottom-0 h-[5px] w-[26px] rounded-full bg-black/45" />
      <span
        className="absolute bottom-[2px] h-[18px] w-[3px] rounded-full"
        style={{ background: `linear-gradient(hsl(${accent} / 0.9), hsl(${accent} / 0.25))` }}
      />

      {/* The board. */}
      <span
        className="relative overflow-hidden rounded-[12px] border-2 bg-ar-surface transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-95"
        style={{ width: W, height: H, padding: PAD, borderColor: `hsl(${accent} / 0.75)` }}
      >
        <Bento images={images.slice(0, 4)} />
      </span>

      {/* Count badge on the board's top-right corner. */}
      <span
        className={cn(
          "font-hud absolute -top-1.5 right-[1px] flex h-5 min-w-6 items-center justify-center rounded-full border-2 border-ar-void px-1.5 text-[10.5px] font-bold tabular-nums",
          mural ? "text-white" : "text-ar-void",
        )}
        style={{ background: mural ? "hsl(var(--rarity-epic))" : "hsl(var(--ar-green-hot))" }}
      >
        {count > 999 ? `${Math.floor(count / 1000)}k` : count}
      </span>
    </button>
  );
});

function Bento({ images }: { images: string[] }) {
  const inner = { w: W - PAD * 2 - 4, h: H - PAD * 2 - 4 }; // minus the 2 px border each side
  const half = { w: (inner.w - GAP) / 2, h: (inner.h - GAP) / 2 };
  const [a, b, c, d] = images;

  if (images.length <= 1) return <Tile uri={a} w={inner.w} h={inner.h} />;
  if (images.length === 2)
    return (
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={a} w={half.w} h={inner.h} />
        <Tile uri={b} w={half.w} h={inner.h} />
      </span>
    );
  if (images.length === 3)
    return (
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={a} w={half.w} h={inner.h} />
        <span className="flex flex-col" style={{ gap: GAP }}>
          <Tile uri={b} w={half.w} h={half.h} />
          <Tile uri={c} w={half.w} h={half.h} />
        </span>
      </span>
    );
  return (
    <span className="flex flex-col" style={{ gap: GAP }}>
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={a} w={half.w} h={half.h} />
        <Tile uri={b} w={half.w} h={half.h} />
      </span>
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={c} w={half.w} h={half.h} />
        <Tile uri={d} w={half.w} h={half.h} />
      </span>
    </span>
  );
}

/** Thumbnail first; the original if the optimizer can't serve it. */
function Tile({ uri, w, h }: { uri?: string; w: number; h: number }) {
  const [original, setOriginal] = useState(false);
  return (
    <span className="block overflow-hidden rounded-[6px] bg-ar-surface-3" style={{ width: w, height: h }}>
      {uri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={original ? uri : thumb(uri)}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          onError={() => setOriginal(true)}
        />
      ) : null}
    </span>
  );
}
