import { Sparkles } from "lucide-react";

import { Switch } from "@wadzzo/ui/components/switch";
import { cn } from "@wadzzo/ui/lib/cn";
import { RangeField } from "@wadzzo/ui/patterns/range-field";
import { Button } from "@wadzzo/ui/poster/button";

import { PIN_STATES, PinPreview } from "./pin-preview";

type Version = { label: string; sub: string; path: string; points: number };

/**
 * The AI's redraw next to the brand's own drawing, so one can be chosen:
 * side by side (stacked on a phone) or one laid over the other. Each side
 * shows the outline, how many points it has, and the pin it makes.
 */
export function CompareView({
  before,
  after,
  overlay,
  onOverlay,
  detail,
  onDetail,
  logo,
  onUse,
  onTryAgain,
  onKeep,
}: {
  /** The brand's drawing. */
  before: { path: string; points: number };
  /** The AI's version, or null when it couldn't be traced. */
  after: { path: string; points: number } | null;
  overlay: boolean;
  onOverlay: (overlay: boolean) => void;
  detail: number;
  onDetail: (detail: number) => void;
  /** What is drawn inside each pin. */
  logo: string | null;
  onUse: () => void;
  onTryAgain: () => void;
  onKeep: () => void;
}) {
  const versions: Version[] = [
    { label: "Before", sub: "Your drawing", ...before },
    { label: "After", sub: "AI version", path: after?.path ?? "", points: after?.points ?? 0 },
  ];

  return (
    <div className="w-full max-w-[1000px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground min-w-0 text-xs">
          Compare your drawing with the AI&apos;s version, then choose.
        </p>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={overlay} onCheckedChange={onOverlay} /> Overlay
        </label>
      </div>

      {overlay ? (
        <figure className="mx-auto w-full max-w-[min(560px,calc(100dvh-340px))] min-w-[240px] space-y-2">
          <svg
            viewBox="-2 -2 104 104"
            className="bg-card aspect-square w-full rounded-xl border"
            role="img"
            aria-label="Before and after, one on top of the other"
          >
            {before.path && (
              <path
                d={before.path}
                className="fill-muted/60 stroke-muted-foreground"
                strokeWidth={0.8}
                strokeDasharray="2 1.5"
              />
            )}
            {after && (
              <path d={after.path} className="fill-primary/25 stroke-primary" strokeWidth={0.9} />
            )}
          </svg>
          <figcaption className="text-muted-foreground flex justify-center gap-4 text-[11px]">
            <span>
              <span className="border-muted-foreground mr-1.5 inline-block w-4 border-t-2 border-dashed align-middle" />
              Before
            </span>
            <span>
              <span className="border-primary mr-1.5 inline-block w-4 border-t-2 align-middle" />
              After
            </span>
          </figcaption>
        </figure>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {versions.map((v) => (
            <figure
              key={v.label}
              className={cn(
                "bg-surface-2 space-y-3 rounded-xl border p-3 sm:p-4",
                v.label === "After" && "border-primary/50",
              )}
            >
              <figcaption className="flex items-baseline justify-between gap-2">
                <span className="font-hud text-base">{v.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {v.sub} · {v.path ? `${v.points} points` : "no outline"}
                </span>
              </figcaption>
              <svg
                viewBox="-2 -2 104 104"
                className="bg-card mx-auto aspect-square w-full max-w-[min(420px,calc(100dvh-420px))] min-w-[200px] rounded-lg border"
                role="img"
                aria-label={`${v.label}: ${v.sub}`}
              >
                {v.path && (
                  <path
                    d={v.path}
                    className={cn(
                      "stroke-primary",
                      v.label === "After" ? "fill-primary/25" : "fill-muted",
                    )}
                    strokeWidth={0.8}
                  />
                )}
              </svg>
              <div className="flex items-end justify-center gap-4">
                {PIN_STATES.map((s, i) => (
                  <PinPreview
                    key={s.label}
                    path={v.path}
                    size={i === 0 ? 72 : 36}
                    ring={s.ring}
                    className={s.className}
                    imageUrl={logo}
                  />
                ))}
              </div>
            </figure>
          ))}
        </div>
      )}

      <div className="mx-auto w-full max-w-[560px] space-y-3">
        <RangeField
          label="Detail"
          min={0}
          max={1}
          step={0.05}
          value={detail}
          onChange={onDetail}
          left="Smooth"
          right="Precise"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="flex-1" disabled={!after} onClick={onUse}>
            Use this
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onTryAgain}>
            <Sparkles /> Try again
          </Button>
          <Button type="button" variant="ghost" className="flex-1" onClick={onKeep}>
            Keep mine
          </Button>
        </div>
        {!after && (
          <p className="text-warning text-xs">The AI result couldn&apos;t be traced — try again.</p>
        )}
      </div>
    </div>
  );
}
