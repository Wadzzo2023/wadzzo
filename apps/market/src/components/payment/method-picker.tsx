"use client";

import { CreditCard } from "lucide-react";

import { PLATFORM_ASSET } from "@wadzzo/wallet/config";
import { cn } from "@wadzzo/ui/lib/cn";
import { WadzzoMark } from "~/ui/wadzzo-mark";
import { XlmMark } from "~/ui/xlm-mark";

export type PayMethod = "PLATFORM_ASSET" | "XLM" | "CARD";

/** Each method's tab icon; the platform token uses the Wadzzo logo itself. */
const META: Record<
  PayMethod,
  { label: string; icon: (props: { className?: string }) => React.ReactNode }
> = {
  PLATFORM_ASSET: {
    label: PLATFORM_ASSET.code,
    icon: ({ className }) => <WadzzoMark className={cn("h-[1.15rem]", className)} />,
  },
  XLM: { label: "XLM", icon: ({ className }) => <XlmMark className={className} /> },
  CARD: { label: "Card", icon: CreditCard },
};

/** Segmented choice of how to pay. */
export function MethodPicker({
  value,
  onChange,
  methods,
}: {
  value: PayMethod;
  onChange: (m: PayMethod) => void;
  methods: PayMethod[];
}) {
  return (
    <div
      className={cn(
        "bg-surface-2 grid gap-1 rounded-2xl p-1",
        methods.length === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
      role="radiogroup"
      aria-label="Payment method"
    >
      {methods.map((m) => {
        const Icon = META[m].icon;
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className={cn(
              "blob flex h-10 items-center justify-center gap-1.5 text-sm font-bold transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {META[m].label}
          </button>
        );
      })}
    </div>
  );
}
