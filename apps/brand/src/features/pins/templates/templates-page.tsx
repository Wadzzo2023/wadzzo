"use client";

import {
  Copy,
  LayoutTemplate,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Radar,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { describeMinutes } from "@wadzzo/schemas/pin-template";
import { Button } from "@wadzzo/ui/poster/button";
import { ConfirmDialog } from "@wadzzo/ui/poster/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wadzzo/ui/poster/dropdown-menu";
import { EmptyState } from "@wadzzo/ui/poster/empty-state";
import { PageBody, PageHeader } from "@wadzzo/ui/poster/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wadzzo/ui/poster/tabs";
import { Skeleton } from "@wadzzo/ui/patterns/skeleton";

import { useHotspotDraft } from "~/store/hotspot-draft";
import { api } from "~/utils/api";

import { templateArea } from "./mapping";
import { TemplateThumb, type TemplateRow } from "./template-picker";

type Kind = "PIN" | "HOTSPOT";

/**
 * Pins › Templates: the brand's saved pin and hotspot setups. Use one to drop
 * a new pin or hotspot, edit it, copy it, or delete it.
 */
export default function TemplatesPage() {
  const [tab, setTab] = useState<Kind>("PIN");
  const list = api.maps.template.list.useQuery();
  const rows = list.data ?? [];
  const pins = rows.filter((t) => t.formType === "PIN");
  const hotspots = rows.filter((t) => t.formType === "HOTSPOT");

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Tools"
        title="Templates"
        description="Saved pin and hotspot setups. Use one to drop a new pin or hotspot in a few clicks."
        back={{ href: "/pins", label: "Map" }}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/pins/hotspots/new">
                <Radar /> New hotspot
              </Link>
            </Button>
            <Button asChild>
              <Link href="/pins/new">
                <Plus /> New pin
              </Link>
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)} className="mt-6">
        <TabsList>
          <TabsTrigger value="PIN">Pins ({pins.length})</TabsTrigger>
          <TabsTrigger value="HOTSPOT">Hotspots ({hotspots.length})</TabsTrigger>
        </TabsList>
        {(["PIN", "HOTSPOT"] as const).map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-5">
            {list.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-36 rounded-[1.4rem]" />
                ))}
              </div>
            ) : list.isError ? (
              <p className="text-destructive text-sm">
                Couldn&apos;t load your templates.{" "}
                <button className="underline" onClick={() => void list.refetch()}>
                  Try again
                </button>
              </p>
            ) : (kind === "PIN" ? pins : hotspots).length === 0 ? (
              <EmptyState
                icon={LayoutTemplate}
                title="No templates yet"
                description={
                  <>
                    Fill in a new {kind === "PIN" ? "pin" : "hotspot"} and choose{" "}
                    <strong>Save as template</strong> to reuse it here.
                  </>
                }
                action={
                  <Button asChild>
                    <Link href={kind === "PIN" ? "/pins/new" : "/pins/hotspots/new"}>
                      <Plus /> New {kind === "PIN" ? "pin" : "hotspot"}
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(kind === "PIN" ? pins : hotspots).map((t) => (
                  <TemplateCard key={t.id} template={t} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </PageBody>
  );
}

/** Where "Use" goes: a pin's form, or for a hotspot its area (saved, or drawn on the map first). */
export function useTemplateLauncher() {
  const router = useRouter();
  const setDraft = useHotspotDraft((s) => s.set);
  const clearDraft = useHotspotDraft((s) => s.clear);
  return (t: TemplateRow) => {
    if (t.formType === "PIN") {
      router.push(`/pins/new?template=${t.id}`);
      return;
    }
    const area = templateArea(t.data);
    if (area) {
      setDraft(area.feature, area.shape);
      router.push(`/pins/hotspots/new?template=${t.id}`);
    } else {
      clearDraft();
      router.push(`/pins?draw=1&template=${t.id}`);
    }
  };
}

function TemplateCard({ template: t }: { template: TemplateRow }) {
  const launch = useTemplateLauncher();
  const utils = api.useUtils();
  const [confirm, setConfirm] = useState(false);

  const duplicate = api.maps.template.duplicate.useMutation({
    onSuccess: (c) => {
      void utils.maps.template.list.invalidate();
      toast.success(`Copied as “${c.name}”`);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.maps.template.delete.useMutation({
    onSuccess: () => {
      void utils.maps.template.list.invalidate();
      setConfirm(false);
      toast.success("Template deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const runs =
    t.formType === "PIN"
      ? t.data.durationMinutes && `Each pin runs ${describeMinutes(t.data.durationMinutes)}`
      : t.data.scheduleDays &&
        `Drops for ${t.data.scheduleDays} day${t.data.scheduleDays === 1 ? "" : "s"}`;

  return (
    <article className="bg-card border-foreground/10 flex flex-col rounded-[1.4rem] border-2 p-4">
      <div className="flex items-start gap-3">
        <TemplateThumb template={t} className="size-14" />
        <div className="min-w-0 flex-1">
          <h3 className="font-hud truncate text-base font-semibold">{t.name}</h3>
          <p className="text-muted-foreground truncate text-sm">{t.data.title ?? "Untitled"}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More for ${t.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/pins/templates/${t.id}`}>
                <Pencil /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={duplicate.isPending}
              onSelect={() => duplicate.mutate({ id: t.id })}
            >
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onSelect={() => setConfirm(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
        <li className="flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          {t.hasLocation
            ? t.formType === "PIN"
              ? "Includes a location"
              : `Includes a ${t.data.area?.shape ?? "drawn"} area`
            : t.formType === "PIN"
              ? "Choose the spot each time"
              : "Draw the area each time"}
        </li>
        {runs && <li>{runs}</li>}
        <li>Updated {new Date(t.updatedAt).toLocaleDateString()}</li>
      </ul>

      <div className="mt-4 flex gap-2">
        <Button className="flex-1" onClick={() => launch(t)}>
          Use
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/pins/templates/${t.id}`}>
            <Pencil /> Edit
          </Link>
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this template?"
        description={`“${t.name}” will be removed. Pins already dropped from it stay as they are.`}
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ id: t.id })}
      />
    </article>
  );
}
