import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { Label } from "@wadzzo/ui/components/label";
import { cn } from "@wadzzo/ui/lib/cn";
import { Button } from "@wadzzo/ui/poster/button";
import { Input } from "@wadzzo/ui/poster/input";

/**
 * "Enhance with AI": slides open under the Whole shape buttons to ask for an
 * optional instruction, then asks the AI to redraw the outline. Closed, it
 * takes no room and can't be tabbed into.
 */
export function EnhancePanel({
  open,
  instruction,
  onInstruction,
  pending,
  canRun,
  hasResult,
  onRun,
  onClose,
}: {
  open: boolean;
  instruction: string;
  onInstruction: (instruction: string) => void;
  pending: boolean;
  canRun: boolean;
  /** An AI version is already on screen, so running again is a retry. */
  hasResult: boolean;
  onRun: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Opening puts the cursor in the box, once the panel has slid open.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 280);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      inert={!open}
    >
      <div className="overflow-hidden">
        <div className="border-primary/40 bg-primary/5 space-y-3 rounded-xl border p-3">
          <p className="text-muted-foreground text-sm">
            The AI redraws your shape: cleaner lines, matching sides, a more polished look. You
            compare before choosing.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="enhance-instruction">Anything else? (optional)</Label>
            <Input
              id="enhance-instruction"
              ref={inputRef}
              maxLength={300}
              placeholder="e.g. make the horns bigger"
              value={instruction}
              onChange={(e) => onInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onRun())}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" className="flex-1" disabled={pending || !canRun} onClick={onRun}>
              {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {pending ? "Enhancing…" : hasResult ? "Try again" : "Enhance"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Close
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">Uses one of your daily AI images.</p>
        </div>
      </div>
    </div>
  );
}
