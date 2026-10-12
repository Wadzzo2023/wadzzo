"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@wadzzo/ui/components/button";
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
      <div className="bg-card w-full max-w-sm rounded-2xl border p-8 text-center">
        <span className="bg-primary/10 text-primary mx-auto mb-4 flex size-12 items-center justify-center rounded-xl">
          <Icon className="size-6" />
        </span>
        <h1 className="font-hud text-xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>
        <Button className="mt-5 w-full" onClick={openSignIn}>
          Sign in
        </Button>
      </div>
    </div>
  );
}
