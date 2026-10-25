import type * as React from "react";

import { TabsList as BaseList, TabsTrigger as BaseTrigger } from "../components/tabs";
import { cn } from "../lib/cn";

export { TabCount, Tabs, TabsContent, tabsListVariants } from "../components/tabs";

/** `default`: a rounded tray with chunky pills; `line`: big condensed labels over a thick underline. */
export function TabsList({ className, ...props }: React.ComponentProps<typeof BaseList>) {
  return (
    <BaseList
      className={cn(
        "data-[variant=default]:bg-surface-2 rounded-2xl data-[variant=default]:p-1 group-data-[orientation=horizontal]/tabs:data-[variant=default]:h-12",
        "data-[variant=line]:border-foreground/[0.08] data-[variant=line]:rounded-none data-[variant=line]:border-b",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof BaseTrigger>) {
  return (
    <BaseTrigger
      className={cn(
        "font-hud tracking-wide uppercase",
        "group-data-[variant=default]/tabs-list:blob group-data-[variant=default]/tabs-list:data-[state=active]:bg-primary group-data-[variant=default]/tabs-list:data-[state=active]:text-primary-foreground group-data-[variant=default]/tabs-list:px-4 group-data-[variant=default]/tabs-list:text-base group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none",
        "group-data-[variant=line]/tabs-list:after:bg-primary group-data-[variant=line]/tabs-list:px-3.5 group-data-[variant=line]/tabs-list:py-3 group-data-[variant=line]/tabs-list:text-xl group-data-[variant=line]/tabs-list:after:h-[3px]",
        className,
      )}
      {...props}
    />
  );
}
