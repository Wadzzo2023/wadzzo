import type * as React from "react";

import { Input as BaseInput } from "@wadzzo/ui/components/input";
import { Textarea as BaseTextarea } from "@wadzzo/ui/components/textarea";
import { cn } from "@wadzzo/ui/lib/cn";

/** Taller fields with a thick hairline that turns green on focus. */
const FIELD =
  "border-foreground/12 bg-surface hover:border-foreground/25 focus-visible:border-primary rounded-xl border-2 px-4 font-medium shadow-none dark:bg-surface";

export function Input({ className, ...props }: React.ComponentProps<typeof BaseInput>) {
  return <BaseInput className={cn(FIELD, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<typeof BaseTextarea>) {
  return <BaseTextarea className={cn(FIELD, "py-3", className)} {...props} />;
}
