import { AlertTriangle } from "lucide-react";

import { Button } from "../components/button";
import { cn } from "../lib/cn";

/** A query failed: say so plainly and offer a retry. */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center rounded-xl border px-6 py-10 text-center",
        className,
      )}
    >
      <AlertTriangle className="text-destructive mb-3 size-6" />
      <p className="font-hud text-sm font-semibold">Something went wrong</p>
      {message && <p className="text-muted-foreground mt-1 max-w-md text-sm">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
