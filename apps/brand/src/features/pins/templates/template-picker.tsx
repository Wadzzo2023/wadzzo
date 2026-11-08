"use client";

import { ChevronDown, LayoutTemplate, MapPin, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { PinTemplateFormType } from "@wadzzo/schemas/pin-template";
import { cn } from "@wadzzo/ui/lib/cn";
import { Button } from "@wadzzo/ui/poster/button";
import { Popover, PopoverContent, PopoverTrigger } from "@wadzzo/ui/poster/popover";

import { api, type RouterOutputs } from "~/utils/api";

export type TemplateRow = RouterOutputs["maps"]["template"]["list"][number];
export type PinTemplateRow = Extract<TemplateRow, { formType: "PIN" }>;
export type HotspotTemplateRow = Extract<TemplateRow, { formType: "HOTSPOT" }>;

/** A template's picture: its pin image, or a plain tile. */
export function TemplateThumb({
  template,
  className,
}: {
  template: TemplateRow;
  className?: string;
}) {
  const image = template.data.image;
  return (
    <span
      className={cn(
        "bg-surface-2 text-muted-foreground relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        <LayoutTemplate className="size-4" />
      )}
      {template.hasLocation && (
        <span
          className="bg-primary text-primary-foreground absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-full"
          title={template.formType === "PIN" ? "Includes a location" : "Includes an area"}
        >
          <MapPin className="size-2.5" />
        </span>
      )}
    </span>
  );
}

/**
 * "Start from template ▾": the brand's templates of this kind (or of both
 * kinds, labelled, when `formType` is left out); picking one calls `onPick`.
 */
export function TemplatePicker({
  formType,
  creatorId,
  onPick,
  className,
  label = "Start from template",
  align = "start",
}: {
  formType?: PinTemplateFormType;
  creatorId?: string;
  onPick: (template: TemplateRow) => void;
  className?: string;
  label?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const list = api.maps.template.list.useQuery(
    { formType, creatorId },
    { enabled: open, staleTime: 30_000 },
  );
  const rows = list.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          <LayoutTemplate /> <span className="hidden sm:inline">{label}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[min(92vw,340px)] p-1.5">
        {list.isLoading ? (
          <p className="text-muted-foreground p-3 text-sm">Loading templates…</p>
        ) : list.isError ? (
          <p className="text-destructive p-3 text-sm">Couldn&apos;t load templates.</p>
        ) : rows.length === 0 ? (
          <div className="p-3 text-sm">
            <p className="font-medium">No templates yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Fill in this form and choose <strong>Save as template</strong> to reuse it later.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {rows.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="hover:bg-accent flex w-full items-center gap-3 rounded-xl p-2 text-left"
                  onClick={() => {
                    setOpen(false);
                    onPick(t);
                  }}
                >
                  <TemplateThumb template={t} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {!formType && (t.formType === "PIN" ? "Pin · " : "Hotspot · ")}
                      {t.data.title ?? "Untitled"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!creatorId && (
          <Link
            href="/pins/templates"
            className="text-muted-foreground hover:text-foreground mt-1 flex items-center gap-2 border-t px-3 pt-2.5 pb-1.5 text-xs"
            onClick={() => setOpen(false)}
          >
            <Settings2 className="size-3.5" /> Manage templates
          </Link>
        )}
      </PopoverContent>
    </Popover>
  );
}
