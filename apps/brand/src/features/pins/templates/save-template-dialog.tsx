"use client";

import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import type { PinTemplateFormType } from "@wadzzo/schemas/pin-template";
import { Checkbox } from "@wadzzo/ui/components/checkbox";
import { Label } from "@wadzzo/ui/components/label";
import { Button } from "@wadzzo/ui/poster/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wadzzo/ui/poster/dialog";
import { Input } from "@wadzzo/ui/poster/input";

import { api } from "~/utils/api";

/**
 * "Save as template": a name, and whether to keep the location (pin) or the
 * drawn area (hotspot). `build` turns the form's current values into the
 * template's data when the brand presses Save.
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  formType,
  creatorId,
  defaultName,
  location,
  build,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formType: PinTemplateFormType;
  /** The brand to save it for (an admin acting on a brand's behalf); the caller's own otherwise. */
  creatorId?: string;
  defaultName?: string;
  /** What the "include" option would keep, e.g. "23.8103, 90.4125", or null when there is none. */
  location: string | null;
  build: (includeLocation: boolean) => unknown;
  onSaved?: (template: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [includeLocation, setIncludeLocation] = useState(location !== null);
  // Each time it opens, start from the form's current title and location.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(defaultName ?? "");
      setIncludeLocation(location !== null);
    }
  }

  const utils = api.useUtils();
  const save = api.maps.template.create.useMutation({
    onSuccess: (t) => {
      void utils.maps.template.list.invalidate();
      toast.success(`Saved as template “${t.name}”`);
      onOpenChange(false);
      onSaved?.(t);
    },
    onError: (e) => toast.error(e.message),
  });

  const what = formType === "PIN" ? "location" : "drawn area";
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || save.isPending) return;
    const data = build(includeLocation && location !== null);
    save.mutate(
      formType === "PIN"
        ? { name: trimmed, formType, creatorId, data: data as never }
        : { name: trimmed, formType, creatorId, data: data as never },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-hud text-2xl">Save as template</DialogTitle>
          <DialogDescription>
            Reuse this {formType === "PIN" ? "pin" : "hotspot"} setup later. Dates are saved as a
            duration, so the template never goes out of date.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation(); // the page's own form is around this dialog in the React tree
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Template name</Label>
            <Input
              id="template-name"
              autoFocus
              maxLength={80}
              value={name}
              placeholder={formType === "PIN" ? "e.g. Weekend coffee drop" : "e.g. Park art hunt"}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <label
            htmlFor="template-include-location"
            className="hover:border-line-bright flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <Checkbox
              id="template-include-location"
              className="mt-0.5"
              checked={includeLocation && location !== null}
              disabled={location === null}
              onCheckedChange={(c) => setIncludeLocation(c === true)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Include the {what}</span>
              <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">
                  {location ?? `No ${what} yet — you'll choose one each time you use it`}
                </span>
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
