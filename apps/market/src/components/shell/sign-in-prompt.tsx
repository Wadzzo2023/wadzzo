"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@wadzzo/ui/poster/button";
import { useRequireAuth } from "~/hooks/use-require-auth";
import { PageSkeleton } from "@wadzzo/ui/patterns/skeleton";

/** Personal pages: the content when signed in, otherwise a friendly sign-in card. */
export function SignedIn({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { signedIn, loading, openSignIn } = useRequireAuth();
  if (loading) return <PageSkeleton />;
  if (signedIn) return <>{children}</>;
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-10">
      <div className="border-foreground bg-surface w-full max-w-md rounded-[1.8rem] border-[3px] p-8 text-center shadow-[8px_9px_0_0_hsl(var(--primary))]">
        <span className="blob bg-primary text-primary-foreground mx-auto mb-5 flex size-16 -rotate-6 items-center justify-center">
          <Icon className="size-7" strokeWidth={2.4} />
        </span>
        <h1 className="display text-5xl">{title}</h1>
        <p className="marker text-primary mt-3 -rotate-1 text-base leading-snug">{description}</p>
        <Button size="lg" className="mt-6 w-full" onClick={openSignIn}>
          <span className="marker text-lg">Sign in</span>
        </Button>
      </div>
    </div>
  );
}
