import Image from "next/image";
import Link from "next/link";

import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

/** Logo on an ink badge + the stacked condensed wordmark, FC88-style. `compact` is the badge alone. */
export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean;
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
        <span className="text-side-ink leading-none">
          <span className="display block text-[2.1rem]">{platformBranding.name}</span>
          <span className="marker text-side-ink/75 block -rotate-2 text-[10px] whitespace-nowrap">
            collect · trade · play
          </span>
        </span>
      )}
    </Link>
  );
}
