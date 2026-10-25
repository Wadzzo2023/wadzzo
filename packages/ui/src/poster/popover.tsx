import type * as React from "react";

import { PopoverContent as BaseContent } from "../components/popover";
import { cn } from "../lib/cn";

export {
  Popover,
  PopoverAnchor,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../components/popover";

export function PopoverContent({ className, ...props }: React.ComponentProps<typeof BaseContent>) {
  return (
    <BaseContent
      className={cn("border-foreground/15 rounded-2xl border-2", className)}
      {...props}
    />
  );
}
