import type * as React from "react";

import {
  DropdownMenuContent as BaseContent,
  DropdownMenuItem as BaseItem,
  DropdownMenuSubContent as BaseSubContent,
} from "../components/dropdown-menu";
import { cn } from "../lib/cn";

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../components/dropdown-menu";

const PANEL = "border-foreground/15 rounded-2xl border-2 p-1.5";

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof BaseContent>) {
  return <BaseContent className={cn(PANEL, className)} {...props} />;
}

export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof BaseSubContent>) {
  return <BaseSubContent className={cn(PANEL, className)} {...props} />;
}

/** Items light up in the primary colour, not the grey accent. */
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof BaseItem>) {
  return (
    <BaseItem
      className={cn(
        "focus:bg-primary focus:text-primary-foreground focus:[&_svg]:text-primary-foreground rounded-lg px-2.5 py-2 font-semibold",
        className,
      )}
      {...props}
    />
  );
}
