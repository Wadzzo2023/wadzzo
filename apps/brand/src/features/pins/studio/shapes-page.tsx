"use client";

import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Pencil,
  Plus,
  Shapes,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { PinGlyph } from "@wadzzo/ui/patterns/pin-glyph";
import { Skeleton } from "@wadzzo/ui/patterns/skeleton";
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

import { api, type RouterOutputs } from "~/utils/api";

import { ShapeStudio } from "./shape-studio";

type Shape = RouterOutputs["maps"]["shape"]["list"][number];

/**
 * Pins › Pin shapes: the brand's own shapes. Make one in Pin Studio, edit it,
 * archive one you no longer offer (pins using it keep it), or delete one
 * nothing uses.
 */
export default function ShapesPage() {
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [studio, setStudio] = useState<{ open: boolean; shape: Shape | null }>({
    open: false,
    shape: null,
  });
  const me = api.fan.creator.meCreator.useQuery(undefined, { staleTime: 5 * 60_000 });
  const active = api.maps.shape.list.useQuery({ archived: false });
  const archived = api.maps.shape.list.useQuery(
    { archived: true },
    { enabled: tab === "archived" },
  );

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Tools"
        title="Pin shapes"
        description="Your own pin shapes. Pick them in any pin's Pin look, alongside the built-in ones."
        back={{ href: "/pins", label: "Map" }}
        actions={
          <Button onClick={() => setStudio({ open: true, shape: null })}>
            <Plus /> New shape
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")} className="mt-6">
        <TabsList>
          <TabsTrigger value="active">In use ({active.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
        {(["active", "archived"] as const).map((t) => {
          const q = t === "active" ? active : archived;
          return (
            <TabsContent key={t} value={t} className="mt-5">
              {q.isLoading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-44 rounded-[1.4rem]" />
                  ))}
                </div>
              ) : q.isError ? (
                <p className="text-destructive text-sm">Couldn&apos;t load your shapes.</p>
              ) : !q.data?.length ? (
                <EmptyState
                  icon={Shapes}
                  title={t === "active" ? "No shapes yet" : "Nothing archived"}
                  description={
                    t === "active"
                      ? "Draw one, trace your logo, or start from a built-in shape."
                      : "Shapes you archive show here. Pins already using them keep them."
                  }
                  action={
                    t === "active" ? (
                      <Button onClick={() => setStudio({ open: true, shape: null })}>
                        <Plus /> New shape
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {q.data.map((s) => (
                    <ShapeCard
                      key={s.id}
                      shape={s}
                      brandImage={me.data?.profileUrl ?? null}
                      onEdit={() => setStudio({ open: true, shape: s })}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <ShapeStudio
        open={studio.open}
        onOpenChange={(o) => setStudio((st) => ({ ...st, open: o }))}
        editing={studio.shape}
        brandImage={me.data?.profileUrl ?? null}
      />
    </PageBody>
  );
}

function ShapeCard({
  shape: s,
  brandImage,
  onEdit,
}: {
  shape: Shape;
  brandImage: string | null;
  onEdit: () => void;
}) {
  const utils = api.useUtils();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = () => void utils.maps.shape.list.invalidate();
  const archive = api.maps.shape.archive.useMutation({
    onSuccess: (r) => {
      refresh();
      toast.success(r.archived ? `Archived “${r.name}”` : `Restored “${r.name}”`);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = api.maps.shape.delete.useMutation({
    onSuccess: () => {
      refresh();
      setConfirmDelete(false);
      toast.success("Shape deleted");
    },
    onError: (e) => {
      setConfirmDelete(false);
      toast.error(e.message);
    },
  });

  return (
    <article className="bg-card border-foreground/10 flex flex-col items-center gap-3 rounded-[1.4rem] border-2 p-4">
      <div className="flex w-full justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={`More for ${s.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => archive.mutate({ id: s.id, archived: !s.archived })}>
              {s.archived ? <ArchiveRestore /> : <Archive />}
              {s.archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <PinGlyph
        path={s.path}
        size={72}
        defaultColor="hsl(var(--muted))"
        imageUrl={brandImage}
        ringColor="hsl(var(--primary))"
        ringWidth={2.5}
      />
      <p className="w-full truncate text-center text-sm font-medium">{s.name}</p>
      <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>
        <Pencil /> Edit
      </Button>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this shape?"
        description="Only a shape nothing uses can be deleted. One that's in use can be archived instead."
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ id: s.id })}
      />
    </article>
  );
}
