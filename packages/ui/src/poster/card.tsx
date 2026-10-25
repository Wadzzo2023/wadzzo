import type * as React from "react";

import { Card as BaseCard, CardTitle as BaseTitle } from "../components/card";
import { cn } from "../lib/cn";

export {
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "../components/card";

/** A sticker panel: rounder corners and a thick hairline instead of a soft shadow. */
export function Card({ className, ...props }: React.ComponentProps<typeof BaseCard>) {
  return (
    <BaseCard
      className={cn("border-foreground/10 rounded-[1.4rem] border-2 shadow-none", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<typeof BaseTitle>) {
  return (
    <BaseTitle className={cn("display text-2xl leading-none font-normal", className)} {...props} />
  );
}
