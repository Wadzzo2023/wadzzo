import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { pageContainerClass } from "./page-layout";

/**
 * Every page's top: optional back link, eyebrow, title, one-line description,
 * and actions on the right (stacking under the title on phones).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="font-hud text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-xs font-semibold tracking-wider uppercase"
          >
            <ChevronLeft className="size-3.5" />
            {back.label}
          </Link>
        )}
        {eyebrow && (
          <p className="font-hud text-primary text-[11px] font-semibold tracking-[0.18em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-hud text-foreground text-2xl leading-tight font-bold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standard page body: max width and padding (sizes come from the app's `--page-*` variables). */
export function PageBody({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={pageContainerClass({ wide, className })}
    >
      {children}
    </div>
  );
}
