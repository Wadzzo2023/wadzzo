import type * as React from "react";

import {
  SelectContent as BaseContent,
  SelectItem as BaseItem,
  SelectTrigger as BaseTrigger,
} from "../components/select";
import { cn } from "../lib/cn";

export {
  Select,
  SelectGroup,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectValue,
} from "../components/select";

export function SelectTrigger({ className, ...props }: React.ComponentProps<typeof BaseTrigger>) {
  return (
    <BaseTrigger
      className={cn(
        "border-foreground/12 bg-surface hover:border-foreground/25 dark:bg-surface rounded-xl border-2 px-4 font-semibold shadow-none data-[size=default]:h-12",
        className,
      )}
      {...props}
    />
  );
}

export function SelectContent({ className, ...props }: React.ComponentProps<typeof BaseContent>) {
  return (
    <BaseContent
      className={cn("border-foreground/15 rounded-2xl border-2", className)}
      {...props}
    />
  );
}

export function SelectItem({ className, ...props }: React.ComponentProps<typeof BaseItem>) {
  return (
    <BaseItem
      className={cn(
        "focus:bg-primary focus:text-primary-foreground rounded-lg py-2 font-semibold",
        className,
      )}
      {...props}
    />
  );
}
