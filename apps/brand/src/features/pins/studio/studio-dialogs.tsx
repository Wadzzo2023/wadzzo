import { Button } from "@wadzzo/ui/poster/button";
import { Dialog, DialogContent, DialogTitle } from "@wadzzo/ui/poster/dialog";

export type ShapeUsage = { pins: number; hotspots: number; templates: number; total: number };

/** "2 pins, 1 template": what draws with a shape. */
export function describeUsage(u: Pick<ShapeUsage, "pins" | "hotspots" | "templates">) {
  const part = (k: number, what: string) => (k ? `${k} ${what}${k === 1 ? "" : "s"}` : "");
  return [part(u.pins, "pin"), part(u.hotspots, "hotspot"), part(u.templates, "template")]
    .filter(Boolean)
    .join(", ");
}

/** Asked before closing the studio with changes that haven't been saved. */
export function DiscardDialog({
  open,
  onOpenChange,
  editing,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="font-hud text-2xl">Discard this shape?</DialogTitle>
        <p className="text-muted-foreground text-sm">
          {editing
            ? "Your changes to this shape haven't been saved."
            : "This shape hasn't been saved yet."}
        </p>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Asked when saving a shape that pins already use: change them all, or save a copy. */
export function UpdateEverywhereDialog({
  open,
  onOpenChange,
  usage,
  busy,
  onSaveNew,
  onUpdateAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usage: ShapeUsage | undefined;
  busy: boolean;
  onSaveNew: () => void;
  onUpdateAll: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="font-hud text-2xl">Update everywhere it&apos;s used?</DialogTitle>
        <p className="text-muted-foreground text-sm">
          This shape is used by {usage ? describeUsage(usage) : "some pins"}. Update them all, or
          leave them as they are and save your changes as a new shape.
        </p>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onSaveNew}>
            Save as new shape
          </Button>
          <Button type="button" disabled={busy} onClick={onUpdateAll}>
            Update all {usage?.total ?? ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
