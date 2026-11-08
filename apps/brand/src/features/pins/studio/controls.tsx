import type { LucideIcon } from "lucide-react";

import { cn } from "@wadzzo/ui/lib/cn";

/** A titled group in the studio's options column. */
export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-hud text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** A small icon-only button (its label is the tooltip and the accessible name). */
export function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  small,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "hover:bg-accent flex items-center justify-center rounded-md disabled:opacity-40",
        small ? "size-7" : "size-8",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
