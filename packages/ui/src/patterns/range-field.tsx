"use client";

import { useId, type ReactNode } from "react";

import { Label } from "../components/label";
import { cn } from "../lib/cn";

/**
 * A labelled slider with optional captions at its two ends ("Smooth" / "Precise").
 * The label is tied to the slider, so it is read out with it.
 */
export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  left,
  right,
  className,
  action,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Captions under the left and right ends. */
  left?: string;
  right?: string;
  className?: string;
  /** Something beside the label, such as a Reset button. */
  action?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        {action}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary w-full"
      />
      {(left ?? right) && (
        <div className="text-muted-foreground flex justify-between text-[10px]">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}
