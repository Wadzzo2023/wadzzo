import type * as React from "react";

import { DialogContent as BaseContent, DialogTitle as BaseTitle } from "../components/dialog";
import { cn } from "../lib/cn";

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTrigger,
} from "../components/dialog";

/** A sticker-style panel: thick border and a hard green drop shadow (the overlay is restyled in globals.css). */
export function DialogContent({ className, ...props }: React.ComponentProps<typeof BaseContent>) {
  return (
    <BaseContent
      className={cn(
        "border-foreground/15 border-2 shadow-[8px_9px_0_0_hsl(var(--primary))]",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof BaseTitle>) {
  return (
    <BaseTitle className={cn("display text-3xl leading-none font-normal", className)} {...props} />
  );
}
