import { nodesToPath } from "@wadzzo/schemas/shape-geometry";
import { Switch } from "@wadzzo/ui/components/switch";
import { cn } from "@wadzzo/ui/lib/cn";
import { RangeField } from "@wadzzo/ui/patterns/range-field";

import { BASES, baseNodes, type Base, type BaseOptions } from "./base-shapes";
import { Panel } from "./controls";

/** The Shapes tool: pick a starting shape and shape it with a few settings. */
export function ShapesPanel({
  base,
  options,
  onPick,
  onOptions,
}: {
  base: Base | null;
  options: BaseOptions;
  onPick: (base: Base) => void;
  onOptions: (patch: Partial<BaseOptions>) => void;
}) {
  return (
    <Panel title="Start from a shape">
      <div className="grid grid-cols-3 gap-2">
        {BASES.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onPick(b.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border p-2 text-xs",
              base === b.id ? "border-primary bg-primary/5" : "hover:border-line-bright",
            )}
          >
            <svg viewBox="0 0 100 100" className="size-9">
              <path
                d={nodesToPath(
                  baseNodes(b.id, {
                    ...options,
                    rounded: b.id === "square" ? true : options.rounded,
                  }),
                )}
                className="fill-primary/20 stroke-primary"
                strokeWidth={4}
              />
            </svg>
            {b.label}
          </button>
        ))}
      </div>
      {base === "polygon" && (
        <RangeField
          label={`Sides: ${options.sides}`}
          min={3}
          max={12}
          step={1}
          value={options.sides}
          onChange={(sides) => onOptions({ sides })}
        />
      )}
      {base === "star" && (
        <>
          <RangeField
            label={`Points: ${options.points}`}
            min={3}
            max={12}
            step={1}
            value={options.points}
            onChange={(points) => onOptions({ points })}
          />
          <RangeField
            label="Inner size"
            min={0.2}
            max={0.8}
            step={0.01}
            value={options.inner}
            onChange={(inner) => onOptions({ inner })}
            left="Spiky"
            right="Chunky"
          />
        </>
      )}
      {(base === "square" || base === "polygon" || base === "star") && (
        <label className="flex items-center justify-between text-sm">
          Rounded corners
          <Switch checked={options.rounded} onCheckedChange={(rounded) => onOptions({ rounded })} />
        </label>
      )}
      {base && (
        <p className="text-muted-foreground text-sm">Switch to Select to fine-tune any point.</p>
      )}
    </Panel>
  );
}
