import Image from "next/image";
import Link from "next/link";

import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

/** Logo + wordmark (the same mark the brand portal and fan apps use). */
export function BrandMark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)} aria-label="Wadzzo home">
      <span className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Image
          src={platformBranding.assets.loading}
          alt=""
          width={22}
          height={18}
          className="h-auto w-[22px] object-contain"
          priority
        />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="font-hud block text-base font-bold tracking-tight">Wadzzo</span>
          <span className="font-hud text-muted-foreground block text-[10px] font-semibold tracking-[0.18em] uppercase">
            Collect · Trade · Play
          </span>
        </span>
      )}
    </Link>
  );
}
