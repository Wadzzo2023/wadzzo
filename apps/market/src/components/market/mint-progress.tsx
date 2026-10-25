const n = (v: number) => v.toLocaleString("en-US");

/** The bare meter: count (and %), with a glowing bar when the edition is limited. */
export function MintMeter({ minted, limit }: { minted: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((minted / limit) * 100)) : null;
  if (limit == null)
    return (
      <p className="display text-2xl">
        Open{" "}
        <span className="marker text-muted-foreground text-xs normal-case">{n(minted)} minted</span>
      </p>
    );
  return (
    <div className="space-y-1.5">
      <p className="display text-xl tabular-nums">
        {n(minted)}
        <span className="text-muted-foreground"> / {n(limit)} minted</span>
        <span className="marker text-primary ml-2 text-sm">{pct}%</span>
      </p>
      <div
        className="border-foreground/15 bg-foreground/5 h-3 overflow-hidden rounded-full border-2"
        role="progressbar"
        aria-valuenow={pct ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Minted"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(pct ?? 0, 2)}%` }}
        />
      </div>
    </div>
  );
}
