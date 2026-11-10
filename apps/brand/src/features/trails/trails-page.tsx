"use client";

import { Archive, Footprints, MoreHorizontal, Pencil, Plus, Route, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import {
  TRAIL_MODE_LABEL,
  TRAIL_STATUS_LABEL,
  TRAIL_STATUSES,
  type TrailStatus,
} from "@wadzzo/schemas/trail";
import { StatusPill } from "@wadzzo/ui/patterns/status-pill";
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
import { Tabs, TabsList, TabsTrigger } from "@wadzzo/ui/poster/tabs";
import { Skeleton } from "@wadzzo/ui/patterns/skeleton";

import { api } from "~/utils/api";

import { TrailThumb } from "./trail-thumb";
import { distanceLabel, STATUS_TONE, type TrailView } from "./trail-lines";

type Filter = "ALL" | TrailStatus;

/**
 * Drops › Trails: the brand's trails with where each stands (draft, in review, live, ended)
 * and how fans are doing. Building and editing happen on the map (Trail mode).
 */
export default function TrailsPage() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const list = api.maps.trail.list.useQuery();
  const rows = list.data ?? [];
  const shown = filter === "ALL" ? rows : rows.filter((t) => t.status === filter);
  const count = (s: TrailStatus) => rows.filter((t) => t.status === s).length;

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Drops"
        title="Trails"
        description="Your pins in order, with the path between them. Fans follow a trail stop by stop and can win a reward for finishing."
        back={{ href: "/pins", label: "Map" }}
        actions={
          <Button asChild>
            <Link href="/pins?trail=new">
              <Plus /> New trail
            </Link>
          </Button>
        }
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mt-6">
        <TabsList>
          <TabsTrigger value="ALL">All ({rows.length})</TabsTrigger>
          {TRAIL_STATUSES.map((s) => (
            <TabsTrigger key={s} value={s}>
              {TRAIL_STATUS_LABEL[s]} ({count(s)})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-5">
        {list.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-[1.4rem]" />
            ))}
          </div>
        ) : list.isError ? (
          <p className="text-destructive text-sm">
            Couldn&apos;t load your trails.{" "}
            <button className="underline" onClick={() => void list.refetch()}>
              Try again
            </button>
          </p>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Route}
            title={rows.length ? "Nothing here" : "No trails yet"}
            description={
              rows.length
                ? "No trails have this status."
                : "Join your pins into a route fans follow stop by stop. Start one on the map."
            }
            action={
              <Button asChild>
                <Link href="/pins?trail=new">
                  <Plus /> New trail
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((t) => (
              <TrailItem key={t.id} trail={t} />
            ))}
          </div>
        )}
      </div>
    </PageBody>
  );
}

function TrailItem({ trail: t }: { trail: TrailView }) {
  const utils = api.useUtils();
  const [confirm, setConfirm] = useState<"delete" | "end" | null>(null);
  const done = (msg: string) => () => {
    void utils.maps.trail.list.invalidate();
    setConfirm(null);
    toast.success(msg);
  };
  const remove = api.maps.trail.delete.useMutation({
    onSuccess: done("Trail deleted"),
    onError: (e) => toast.error(e.message),
  });
  const archive = api.maps.trail.archive.useMutation({
    onSuccess: done("Trail ended"),
    onError: (e) => toast.error(e.message),
  });
  const submit = api.maps.trail.submit.useMutation({
    onSuccess: done("Sent for review"),
    onError: (e) => toast.error(e.message),
  });

  return (
    <article className="bg-card border-foreground/10 flex flex-col rounded-[1.4rem] border-2 p-4">
      <div className="flex items-start gap-3">
        <TrailThumb trail={t} className="size-16" />
        <div className="min-w-0 flex-1">
          <h3 className="font-hud truncate text-base font-semibold">{t.title}</h3>
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <Footprints className="size-3" aria-hidden /> {TRAIL_MODE_LABEL[t.mode]} ·{" "}
            {t.stops.length} stops · {distanceLabel(t.distanceMetres)}
          </p>
          <StatusPill tone={STATUS_TONE[t.status]} className="mt-1.5">
            {TRAIL_STATUS_LABEL[t.status]}
          </StatusPill>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More for ${t.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {t.status !== "ENDED" && (
              <DropdownMenuItem asChild>
                <Link href={`/pins?trail=${t.id}`}>
                  <Pencil /> Edit on map
                </Link>
              </DropdownMenuItem>
            )}
            {t.status === "LIVE" && (
              <DropdownMenuItem onSelect={() => setConfirm("end")}>
                <Archive /> End trail
              </DropdownMenuItem>
            )}
            {t.runs === 0 && (
              <DropdownMenuItem className="text-destructive" onSelect={() => setConfirm("delete")}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ul className="text-muted-foreground mt-3 space-y-1 text-xs">
        <li>
          {new Date(t.startDate).toLocaleDateString()} – {new Date(t.endDate).toLocaleDateString()}
        </li>
        <li>
          {t.runs} fan{t.runs === 1 ? "" : "s"} started
          {t.reward ? ` · reward: ${t.reward.asset.code} (${t.reward.remaining} left)` : ""}
        </li>
        {t.status === "DRAFT" && t.reviewNote && (
          <li className="tone-warning rounded-md px-2 py-1">Sent back: {t.reviewNote}</li>
        )}
      </ul>

      <div className="mt-4 flex gap-2">
        {t.status === "DRAFT" ? (
          <Button
            className="flex-1"
            disabled={submit.isPending}
            onClick={() => submit.mutate({ id: t.id })}
          >
            Send for review
          </Button>
        ) : (
          <Button className="flex-1" variant="outline" asChild>
            <Link href={`/pins?trail=${t.id}`}>View on map</Link>
          </Button>
        )}
        {t.status !== "ENDED" && t.status !== "LIVE" && (
          <Button variant="outline" asChild>
            <Link href={`/pins?trail=${t.id}`}>
              <Pencil /> Edit
            </Link>
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this trail?"
        description={`“${t.title}” will be removed, with the stops made in its builder. Pins that were yours already stay on the map.`}
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ id: t.id })}
      />
      <ConfirmDialog
        open={confirm === "end"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="End this trail?"
        description="Fans stop seeing it. Rewards already claimed stay theirs; the pins stay live."
        confirmLabel="End trail"
        busy={archive.isPending}
        onConfirm={() => archive.mutate({ id: t.id })}
      />
    </article>
  );
}
