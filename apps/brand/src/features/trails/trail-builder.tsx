"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Gift,
  Loader2,
  Maximize2,
  Minus,
  Redo2,
  Route,
  Save,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Waypoints,
  X,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { estimateMinutes, pathMetres } from "@wadzzo/geo/trail-geometry";
import {
  MAX_TRAIL_STOPS,
  submitProblems,
  TRAIL_COLORS,
  TRAIL_STATUS_LABEL,
  type StopDefaults,
} from "@wadzzo/schemas/trail";
import { Checkbox } from "@wadzzo/ui/components/checkbox";
import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { cn } from "@wadzzo/ui/lib/cn";
import { Segmented } from "@wadzzo/ui/patterns/segmented";
import { StatusPill } from "@wadzzo/ui/patterns/status-pill";
import { Button } from "@wadzzo/ui/poster/button";
import { ConfirmDialog } from "@wadzzo/ui/poster/confirm-dialog";
import { Input } from "@wadzzo/ui/poster/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wadzzo/ui/poster/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wadzzo/ui/poster/tabs";
import { Textarea } from "@wadzzo/ui/poster/textarea";

import { ImageUploadField } from "~/components/pins/pin-form-parts";
import { PinLookEditor, toLookValue } from "~/features/pins/look/pin-look-section";
import { api } from "~/utils/api";

import {
  draftPath,
  moveStop,
  removeStop,
  reverseStops,
  sectionKey,
  unroutedPairs,
  updateStop,
  useTrailBuilder,
  type TrailDraft,
} from "./builder-store";
import { distanceLabel, STATUS_TONE, type TrailView } from "./trail-lines";

const toInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** What the builder sends to `maps.trail.save`. */
export function saveInput(d: TrailDraft) {
  return {
    id: d.id,
    creatorId: d.creatorId,
    updatedAt: d.updatedAt,
    title: d.title.trim() || "Untitled trail",
    description: d.description.trim() || null,
    coverImage: d.coverImage,
    mode: d.mode,
    order: d.order,
    color: d.color,
    startDate: d.startDate,
    endDate: d.endDate,
    stops: d.stops.map((s) => ({ pinId: s.pinId, required: s.required, clue: s.clue })),
    path: draftPath(d),
    stopDefaults: d.stopDefaults,
    reward: d.reward,
  };
}

/**
 * Trail mode's panel (docs/trails): the stops in order, the trail's details, the style every
 * new stop starts from, and the finishing reward. The map beside it adds stops: click one of
 * your pins, or empty map for a new stop. Everything is saved at once.
 */
export function TrailBuilder({
  onFit,
  onClose,
  onSaved,
}: {
  onFit: () => void;
  onClose: () => void;
  onSaved: (t: TrailView) => void;
}) {
  const draft = useTrailBuilder((s) => s.draft);
  const clean = useTrailBuilder((s) => s.clean);
  const canUndo = useTrailBuilder((s) => s.past.length > 0);
  const canRedo = useTrailBuilder((s) => s.future.length > 0);
  const { change, undo, redo, saved } = useTrailBuilder.getState();
  const [tab, setTab] = useState("stops");
  const [confirmClose, setConfirmClose] = useState(false);
  const [restyle, setRestyle] = useState(false);
  const utils = api.useUtils();

  const save = api.maps.trail.save.useMutation({ onError: (e) => toast.error(e.message) });
  const submit = api.maps.trail.submit.useMutation({ onError: (e) => toast.error(e.message) });
  const route = api.maps.trail.routeSection.useMutation();
  const applyStyle = api.maps.trail.applyStyle.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const assist = api.maps.trail.assist.useMutation({ onError: (e) => toast.error(e.message) });
  const [routing, setRouting] = useState(false);

  if (!draft) return null;
  const set = (patch: Partial<TrailDraft>) => change((d) => ({ ...d, ...patch }));
  const path = draftPath(draft);
  const metres = pathMetres(path);
  const required = draft.stops.filter((s) => s.required).length;
  const problems = submitProblems({ stops: draft.stops, path, endDate: draft.endDate });

  const persist = async () => {
    const t = await save.mutateAsync(saveInput(draft));
    void utils.maps.trail.list.invalidate();
    saved({ ...draft, id: t.id, updatedAt: new Date(t.updatedAt), status: t.status });
    onSaved(t);
    return t;
  };

  const onSave = async () => {
    try {
      await persist();
      toast.success("Trail saved");
    } catch {
      // shown by onError
    }
  };

  const onSubmit = async () => {
    try {
      const t = await persist();
      await submit.mutateAsync({ id: t.id });
      void utils.maps.trail.list.invalidate();
      saved({ ...draft, id: t.id, updatedAt: new Date(), status: "PENDING" });
      toast.success("Sent for review. Fans see the trail once it's approved.");
    } catch {
      // shown by onError
    }
  };

  /** Street paths for every straight section, one request per section. */
  const snap = async () => {
    const pairs = unroutedPairs(draft);
    if (!pairs.length) return;
    setRouting(true);
    const found: TrailDraft["routes"] = {};
    let missed = 0;
    for (const [a, b] of pairs) {
      const section = await route
        .mutateAsync({
          mode: draft.mode,
          points: [
            [a.lng, a.lat],
            [b.lng, b.lat],
          ],
        })
        .catch(() => null);
      if (section) found[sectionKey(a, b)] = section;
      else missed++;
    }
    setRouting(false);
    if (Object.keys(found).length) change((d) => ({ ...d, routes: { ...d.routes, ...found } }));
    if (missed)
      toast(
        `${missed} section${missed === 1 ? "" : "s"} had no street route, so they stay straight`,
      );
  };
  const straighten = () => change((d) => ({ ...d, routes: {} }));
  const routed = Object.keys(draft.routes).length > 0;

  const setDefaults = (patch: Partial<StopDefaults>) =>
    set({ stopDefaults: { ...draft.stopDefaults, ...patch } });

  const runAssist = async () => {
    const r = await assist
      .mutateAsync({
        stops: draft.stops.map((s) => ({ title: s.title, lat: s.lat, lng: s.lng })),
        mode: draft.mode,
        title: draft.title,
      })
      .catch(() => null);
    if (!r) return;
    set({ title: r.title, description: r.description });
    if (r.clues.length)
      change((d) => ({
        ...d,
        stops: d.stops.map((s, i) => (s.clue ? s : { ...s, clue: r.clues[i] ?? null })),
      }));
    toast.success("Filled in by ✦ Assist. Check it reads right.");
  };

  const busy = save.isPending || submit.isPending;

  return (
    <aside
      aria-label="Trail builder"
      className="bg-card border-foreground/10 flex max-h-full w-full flex-col overflow-hidden rounded-[1.2rem] border-2 shadow-lg lg:w-[400px]"
    >
      {/* Header */}
      <div className="border-foreground/10 flex items-start gap-2 border-b-2 p-3">
        <Route className="mt-0.5 size-4 shrink-0" style={{ color: draft.color }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-hud truncate text-sm font-semibold">
            {draft.title.trim() || (draft.id ? "Untitled trail" : "New trail")}
          </p>
          <p className="text-muted-foreground text-xs">
            {draft.stops.length} stop{draft.stops.length === 1 ? "" : "s"} · {distanceLabel(metres)}{" "}
            · about {estimateMinutes(metres, draft.mode)} min
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[draft.status]}>{TRAIL_STATUS_LABEL[draft.status]}</StatusPill>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close trail mode"
          onClick={() => (clean ? onClose() : setConfirmClose(true))}
        >
          <X />
        </Button>
      </div>

      {draft.reviewNote && draft.status === "DRAFT" && (
        <p className="tone-warning mx-3 mt-3 rounded-lg px-3 py-2 text-xs">
          <strong>Sent back by review:</strong> {draft.reviewNote}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-3">
          <TabsTrigger value="stops">Stops ({draft.stops.length})</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="style">Stop style</TabsTrigger>
          <TabsTrigger value="reward">Reward</TabsTrigger>
        </TabsList>

        {/* ── Stops ── */}
        <TabsContent value="stops" className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex flex-wrap items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <Undo2 />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
            >
              <Redo2 />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={draft.stops.length < 2}
              onClick={() => change(reverseStops)}
            >
              <ArrowUpDown /> Reverse
            </Button>
            {routed ? (
              <Button size="sm" variant="ghost" onClick={straighten}>
                <Minus /> Straight lines
              </Button>
            ) : null}
            {/* Only while some section is still straight: once all follow streets, there's nothing to snap. */}
            {(routing || unroutedPairs(draft).length > 0) && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={draft.stops.length < 2 || routing}
                onClick={() => void snap()}
              >
                {routing ? <Loader2 className="animate-spin" /> : <Waypoints />} Snap to streets
              </Button>
            )}
          </div>

          {draft.stops.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border-2 border-dashed p-4 text-sm">
              <p className="text-foreground font-medium">Add the first stop</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                <li>Click one of your pins on the map to make it a stop.</li>
                <li>Click empty map to make a new pin there as a stop.</li>
              </ul>
            </div>
          ) : (
            <ol className="space-y-2">
              {draft.stops.map((s, i) => (
                <li key={s.pinId} className="border-foreground/10 rounded-xl border-2 p-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-hud flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white tabular-nums"
                      style={{
                        backgroundColor: s.required ? draft.color : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${s.title} up`}
                      disabled={i === 0}
                      onClick={() => change((d) => moveStop(d, i, i - 1))}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Move ${s.title} down`}
                      disabled={i === draft.stops.length - 1}
                      onClick={() => change((d) => moveStop(d, i, i + 1))}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${s.title} from the trail`}
                      onClick={() => change((d) => removeStop(d, s.pinId))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 pl-8">
                    <Checkbox
                      id={`opt-${s.pinId}`}
                      checked={!s.required}
                      onCheckedChange={(v) =>
                        change((d) => updateStop(d, s.pinId, { required: v !== true }))
                      }
                    />
                    <Label htmlFor={`opt-${s.pinId}`} className="text-xs">
                      Optional (bonus stop)
                    </Label>
                  </div>
                  <Input
                    className="mt-2 h-8 text-xs"
                    aria-label={`Clue for stop ${i + 1}`}
                    placeholder="Clue or tip for fans (optional)"
                    maxLength={280}
                    value={s.clue ?? ""}
                    onChange={(e) =>
                      change((d) => updateStop(d, s.pinId, { clue: e.target.value || null }))
                    }
                  />
                </li>
              ))}
            </ol>
          )}
          {draft.stops.length >= MAX_TRAIL_STOPS && (
            <p className="text-muted-foreground mt-2 text-xs">
              A trail can have up to {MAX_TRAIL_STOPS} stops.
            </p>
          )}
        </TabsContent>

        {/* ── Details ── */}
        <TabsContent value="details" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="trail-title">Name</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={draft.stops.length < 2 || assist.isPending}
                title={draft.stops.length < 2 ? "Add two stops first" : undefined}
                onClick={() => void runAssist()}
              >
                {assist.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} ✦ Assist
              </Button>
            </div>
            <Input
              id="trail-title"
              value={draft.title}
              maxLength={80}
              placeholder="e.g. Old Town coffee trail"
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trail-description">Description</Label>
            <Textarea
              id="trail-description"
              rows={3}
              value={draft.description}
              placeholder="What fans will see and get on the way"
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <ImageUploadField
            value={draft.coverImage ?? undefined}
            onChange={(url) => set({ coverImage: url ?? null })}
          />
          <div className="space-y-1.5">
            <Label>Getting around</Label>
            <Segmented
              label="Getting around"
              value={draft.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { id: "WALK", label: "Walk" },
                { id: "BIKE", label: "Bike" },
                { id: "DRIVE", label: "Drive" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stops</Label>
            <Segmented
              label="Stop order"
              value={draft.order}
              onChange={(order) => set({ order })}
              options={[
                { id: "ORDERED", label: "In order" },
                { id: "ANY", label: "Any order" },
              ]}
            />
            <p className="text-muted-foreground text-xs">
              {draft.order === "ORDERED"
                ? "Fans collect the required stops one after another; the next one unlocks as they go."
                : "Fans collect the stops in whatever order they like."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {TRAIL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={draft.color === c}
                  onClick={() => set({ color: c })}
                  className={cn(
                    "size-7 rounded-full border-2 border-white shadow",
                    draft.color === c && "ring-foreground ring-2 ring-offset-1",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trail-start">Starts</Label>
              <Input
                id="trail-start"
                type="datetime-local"
                value={toInput(draft.startDate)}
                onChange={(e) => e.target.value && set({ startDate: new Date(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trail-end">Ends</Label>
              <Input
                id="trail-end"
                type="datetime-local"
                value={toInput(draft.endDate)}
                onChange={(e) => e.target.value && set({ endDate: new Date(e.target.value) })}
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Stop style (defaults for new stops) ── */}
        <TabsContent value="style" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <p className="text-muted-foreground text-xs">
            Every new stop starts from these, so the trail looks like one set. Existing pins you add
            are asked whether to use this style.
          </p>
          <PinLookEditor
            compact
            value={toLookValue(draft.stopDefaults.look ?? null)}
            onChange={(look) => {
              setDefaults({ look });
              if (draft.stops.length) setRestyle(true);
            }}
            autoCollect={draft.stopDefaults.autoCollect ?? false}
            creatorId={draft.creatorId}
          />
          {restyle && draft.stops.length > 0 && (
            <div className="tone-info flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs">
              <span className="flex-1">Update the look of all {draft.stops.length} stops?</span>
              <Button
                size="sm"
                disabled={applyStyle.isPending}
                onClick={() =>
                  applyStyle.mutate(
                    {
                      creatorId: draft.creatorId,
                      look: draft.stopDefaults.look ?? {},
                      pinIds: draft.stops.map((s) => s.pinId),
                    },
                    {
                      onSuccess: (r) => {
                        setRestyle(false);
                        void utils.maps.pin.getMyPins.invalidate();
                        toast.success(`Updated ${r.count} stop${r.count === 1 ? "" : "s"}`);
                      },
                    },
                  )
                }
              >
                Update all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRestyle(false)}>
                Only new stops
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch
              id="defaults-auto"
              checked={draft.stopDefaults.autoCollect ?? false}
              onCheckedChange={(v) => setDefaults({ autoCollect: v })}
            />
            <Label htmlFor="defaults-auto" className="text-sm">
              New stops auto-collect
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="defaults-limit">How many fans can collect each stop</Label>
            <Input
              id="defaults-limit"
              type="number"
              min={0}
              placeholder="No limit"
              value={draft.stopDefaults.pinCollectionLimit ?? ""}
              onChange={(e) =>
                setDefaults({
                  pinCollectionLimit: e.target.value
                    ? Math.max(0, Number(e.target.value))
                    : undefined,
                })
              }
            />
          </div>
        </TabsContent>

        {/* ── Reward ── */}
        <TabsContent value="reward" className="min-h-0 flex-1 overflow-y-auto p-3">
          <RewardTab draft={draft} required={required} onChange={(reward) => set({ reward })} />
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="border-foreground/10 flex flex-wrap items-center gap-2 border-t-2 p-3">
        <Button size="sm" variant="ghost" onClick={onFit} disabled={!draft.stops.length}>
          <Maximize2 /> Fit
        </Button>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || clean}
            onClick={() => void onSave()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {draft.status === "LIVE" ? "Save" : "Save draft"}
          </Button>
          {draft.status !== "LIVE" && draft.status !== "ENDED" && (
            <Button
              size="sm"
              disabled={busy || problems.length > 0 || (draft.status === "PENDING" && clean)}
              title={problems.join(". ") || undefined}
              onClick={() => void onSubmit()}
            >
              {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send for review
            </Button>
          )}
        </div>
        {draft.status === "LIVE" && !clean && (
          <p className="text-muted-foreground w-full text-xs">
            Changing stops or the path sends a live trail back to review; fans keep seeing it.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Leave without saving?"
        description="Your changes to this trail will be lost. Stops you made stay as pins."
        confirmLabel="Leave"
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </aside>
  );
}

function RewardTab({
  draft,
  required,
  onChange,
}: {
  draft: TrailDraft;
  required: number;
  onChange: (r: TrailDraft["reward"]) => void;
}) {
  const assets = api.fan.asset.myAssets.useQuery();
  const items = assets.data?.shopAsset ?? [];
  const r = draft.reward;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Switch
          id="trail-reward"
          checked={r !== null}
          disabled={!items.length && r === null}
          onCheckedChange={(on) =>
            onChange(on && items[0] ? { assetId: items[0].id, limit: 100, minStops: null } : null)
          }
        />
        <div>
          <Label htmlFor="trail-reward" className="flex items-center gap-1 text-sm">
            <Gift className="size-3.5" /> Finishing reward
          </Label>
          <p className="text-muted-foreground text-xs">
            Fans who finish claim one of your items to their wallet, the same way as a pin&apos;s.
          </p>
          {!assets.isLoading && !items.length && (
            <p className="text-muted-foreground mt-1 text-xs">
              You have no items yet. Create one in Stores to offer a reward.
            </p>
          )}
        </div>
      </div>

      {r && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="reward-item">Item</Label>
            <Select
              value={String(r.assetId)}
              onValueChange={(v) => onChange({ ...r, assetId: Number(v) })}
            >
              <SelectTrigger id="reward-item">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reward-limit">How many fans can claim it</Label>
            <Input
              id="reward-limit"
              type="number"
              min={1}
              value={r.limit}
              onChange={(e) => onChange({ ...r, limit: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reward-min-stops">Finished after</Label>
            <Select
              value={r.minStops == null ? "all" : String(r.minStops)}
              onValueChange={(v) => onChange({ ...r, minStops: v === "all" ? null : Number(v) })}
            >
              <SelectTrigger id="reward-min-stops">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All required stops ({required})</SelectItem>
                {Array.from({ length: Math.max(0, required - 1) }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} of {required} required stops
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}
