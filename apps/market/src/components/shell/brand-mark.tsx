import Image from "next/image";
import Link from "next/link";

import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * Logo on an ink badge + the stacked condensed wordmark, FC88-style. `compact` is the badge alone.
 * `plain` sets the wordmark in the page's own colours (the phone header, which has no green block).
 */
export function BrandMark({
  compact = false,
  plain = false,
  className,
}: {
  compact?: boolean;
  plain?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      className={cn("group flex items-center gap-3", className)}
      aria-label={`${platformBranding.name} home`}
    >
      <span className="blob bg-side-ink flex size-11 shrink-0 items-center justify-center transition-transform duration-200 group-hover:-rotate-6">
        <Image
          src={platformBranding.assets.loading}
          alt=""
          width={26}
          height={22}
          style={{ width: 26, height: "auto" }}
          className="object-contain"
          priority
        />
      </span>
      {!compact && (
        <span className={cn("leading-none", plain ? "text-foreground" : "text-side-ink")}>
          <span className="display block text-[2.1rem]">{platformBranding.name}</span>
          <span
            className={cn(
              "marker block -rotate-2 text-[10px] whitespace-nowrap",
              plain ? "text-primary" : "text-side-ink/75",
            )}
          >
            collect · trade · play
          </span>
        </span>
      )}
    </Link>
  );
}
