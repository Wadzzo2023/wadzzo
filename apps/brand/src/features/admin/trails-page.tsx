"use client";

import { Check, Footprints, Loader2, Route, Undo2 } from "lucide-react";
import { useState } from "react";
import { Marker } from "react-map-gl/mapbox";
import toast from "react-hot-toast";

import { TRAIL_MODE_LABEL } from "@wadzzo/schemas/trail";
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
import { EmptyState } from "@wadzzo/ui/poster/empty-state";
import { PageBody, PageHeader } from "@wadzzo/ui/poster/page-header";
import { Textarea } from "@wadzzo/ui/poster/textarea";
import { Skeleton } from "@wadzzo/ui/patterns/skeleton";

import { BaseMap } from "~/components/map-kit/base-map";
import { TrailLayer } from "~/components/map-kit/trail-layer";
import {
  boundsOf,
  distanceLabel,
  lineOf,
  trailColor,
  type TrailView,
} from "~/features/trails/trail-lines";
import { api } from "~/utils/api";

/**
 * Admin › Trail review: trails brands sent for review. The path and stops on a map, then
 * Approve (fans see it) or Send back with a note (it returns to the brand as a draft).
 * The stops are the brand's pins, reviewed as pins already; this checks the trail itself.
 */
export default function TrailReviewPage() {
  const queue = api.maps.trail.reviewQueue.useQuery();
  const rows = queue.data ?? [];
  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Trail review"
        description="Check each trail's route, stops and text before fans see it."
      />
      <div className="mt-6 space-y-4">
        {queue.isLoading ? (
          [0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-[1.4rem]" />)
        ) : queue.isError ? (
          <p className="text-destructive text-sm">{queue.error.message}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Route}
            title="Nothing to review"
            description="Trails brands send for review show up here."
          />
        ) : (
          rows.map((t) => <ReviewItem key={t.id} trail={t} />)
        )}
      </div>
    </PageBody>
  );
}

function ReviewItem({ trail: t }: { trail: TrailView }) {
  const utils = api.useUtils();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const done = (msg: string) => () => {
    void utils.maps.trail.reviewQueue.invalidate();
    setRejecting(false);
    toast.success(msg);
  };
  const approve = api.maps.trail.approve.useMutation({
    onSuccess: done(`“${t.title}” is live`),
    onError: (e) => toast.error(e.message),
  });
  const reject = api.maps.trail.reject.useMutation({
    onSuccess: done("Sent back to the brand"),
    onError: (e) => toast.error(e.message),
  });
  const color = trailColor(t);
  const box = boundsOf(
    t.stops.map((s) => ({ lat: s.pin.latitude, lng: s.pin.longitude })),
    t.path,
  );

  return (
    <article className="bg-card border-foreground/10 grid overflow-hidden rounded-[1.4rem] border-2 lg:grid-cols-[1fr_380px]">
      <div className="h-64 lg:h-auto lg:min-h-72">
        <BaseMap
          controlsPosition="bottom-right"
          initialViewState={box ? { bounds: box, fitBoundsOptions: { padding: 48 } } : undefined}
        >
          <TrailLayer trails={[lineOf({ ...t, status: "LIVE" })]} selectedId={t.id} />
          {t.stops.map((s) => (
            <Marker key={s.pin.id} latitude={s.pin.latitude} longitude={s.pin.longitude}>
              <span
                className="font-hud flex size-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow"
                style={{ backgroundColor: color }}
                title={s.pin.title}
              >
                {s.position}
              </span>
            </Marker>
          ))}
        </BaseMap>
      </div>
      <div className="flex flex-col p-4">
        <p className="text-muted-foreground text-xs">{t.creator.name}</p>
        <h3 className="font-hud text-lg font-semibold">{t.title}</h3>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <Footprints className="size-3" aria-hidden /> {TRAIL_MODE_LABEL[t.mode]} ·{" "}
          {t.stops.length} stops · {distanceLabel(t.distanceMetres)} ·{" "}
          {t.order === "ORDERED" ? "in order" : "any order"}
          {t.publishedAt ? " · edit of a live trail" : ""}
        </p>
        {t.description && <p className="mt-2 text-sm">{t.description}</p>}
        <ol className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
          {t.stops.map((s) => (
            <li key={s.pin.id} className="flex gap-2">
              <span className="text-muted-foreground w-5 text-right tabular-nums">
                {s.position}.
              </span>
              <span className="min-w-0 flex-1 truncate">
                {s.pin.title}
                {s.pin.approved !== true && (
                  <span className="text-warning ml-1 text-xs">(pin not approved)</span>
                )}
              </span>
            </li>
          ))}
        </ol>
        {t.reward && (
          <p className="text-muted-foreground mt-2 text-xs">
            Reward: {t.reward.limit} × {t.reward.asset.code}
            {t.reward.minStops ? ` after ${t.reward.minStops} stops` : " for every required stop"}
          </p>
        )}
        <div className="mt-auto flex gap-2 pt-4">
          <Button
            className="flex-1"
            disabled={approve.isPending}
            onClick={() => approve.mutate({ id: t.id })}
          >
            {approve.isPending ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
          <Button variant="outline" onClick={() => setRejecting(true)}>
            <Undo2 /> Send back
          </Button>
        </div>
      </div>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send back</DialogTitle>
            <DialogDescription>
              “{t.title}” goes back to the brand as a draft with your note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`note-${t.id}`}>What should they fix?</Label>
            <Textarea
              id={`note-${t.id}`}
              rows={3}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              disabled={!note.trim() || reject.isPending}
              onClick={() => reject.mutate({ id: t.id, note })}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
