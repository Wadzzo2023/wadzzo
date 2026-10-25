import type * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { Button as BaseButton, buttonVariants as baseVariants } from "../components/button";
import { cn } from "../lib/cn";

/**
 * The marketplace's chunky look over the shared button: tilted "blob" fills, bolder type,
 * taller large size. Classes a caller passes still win (they're merged last).
 */
const VARIANT: Record<string, string> = {
  default:
    "blob font-sans font-bold tracking-normal hover:-translate-y-0.5 hover:-rotate-1 hover:bg-primary [&>span.marker]:text-[15px]",
  outline:
    "border-foreground/15 hover:border-foreground hover:text-foreground border-2 bg-transparent shadow-none hover:bg-transparent",
  secondary: "blob bg-surface-3 hover:-translate-y-0.5 hover:rotate-1",
  ghost: "hover:bg-foreground/[0.06] hover:text-foreground",
};
const SIZE: Record<string, string> = {
  default: "h-10 rounded-xl",
  sm: "rounded-lg",
  lg: "h-14 rounded-xl px-7 text-base",
  "icon-sm": "rounded-lg",
};

type Props = React.ComponentProps<typeof BaseButton>;

function skin(variant: Props["variant"] = "default", size: Props["size"] = "default") {
  return cn(
    "font-sans font-bold tracking-normal",
    VARIANT[variant ?? "default"],
    SIZE[size ?? "default"],
  );
}

export function Button({ variant, size, className, ...props }: Props) {
  return (
    <BaseButton
      variant={variant}
      size={size}
      className={cn(skin(variant, size), className)}
      {...props}
    />
  );
}

export function buttonVariants(
  options: VariantProps<typeof baseVariants> & { className?: string } = {},
) {
  return baseVariants({
    ...options,
    className: cn(skin(options.variant, options.size), options.className),
  });
}
