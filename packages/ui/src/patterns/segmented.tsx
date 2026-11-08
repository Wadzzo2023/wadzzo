"use client";

import { cn } from "../lib/cn";

/**
 * A small either-or choice shown as joined buttons (a radio group underneath,
 * so it reads and tabs like one). For two to four short options.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly {
    id: T;
    label: string;
    /** Can't be chosen right now; `title` says why. */
    disabled?: boolean;
    title?: string;
  }[];
  onChange: (id: T) => void;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("bg-surface-2 inline-flex gap-1 rounded-lg p-0.5", className)}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-8 rounded-md px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45",
            value === o.id ? "bg-card shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
