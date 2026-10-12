"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@wadzzo/ui/components/button";
import { usePortalAccess } from "~/components/shell/use-portal-access";
import { PageSkeleton } from "~/ui/skeleton";

/** Pages only the Wadzzo deployment's admins may use (platform management, audit log). */
export function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { adminSettled, isSuperAdmin } = usePortalAccess();
  if (!adminSettled) return <PageSkeleton />;
  if (isSuperAdmin) return <>{children}</>;
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <ShieldAlert className="text-muted-foreground mx-auto mb-3 size-8" />
        <h1 className="font-hud text-xl font-bold">Not available here</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Platform management and the audit log are for Wadzzo admins.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/admin/creators">Back to admin</Link>
        </Button>
      </div>
    </div>
  );
}
