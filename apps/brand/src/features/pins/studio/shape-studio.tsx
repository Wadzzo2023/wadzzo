"use client";

import {
  FlipHorizontal2,
  FlipVertical2,
  Loader2,
  Redo2,
  Sparkles,
  Spline,
  Squircle,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { checkShapePath, type ShapeAnchor } from "@wadzzo/schemas/pin-look";
import {
  flipNodes,
  nodesToPath,
  outlineProblems,
  pathToNodes,
  type Node,
  type Pt,
} from "@wadzzo/schemas/shape-geometry";
import { pathCoverage, THIN_SHAPE_COVERAGE } from "@wadzzo/schemas/shape-size";
import { Label } from "@wadzzo/ui/components/label";
import { cn } from "@wadzzo/ui/lib/cn";
import { Segmented } from "@wadzzo/ui/patterns/segmented";
import { Button } from "@wadzzo/ui/poster/button";
import { Dialog, DialogContent, DialogTitle } from "@wadzzo/ui/poster/dialog";

import { api, type RouterOutputs } from "~/utils/api";

import { baseNodes, DEFAULT_BASE_OPTIONS, type Base, type BaseOptions } from "./base-shapes";
import { CompareView } from "./compare-view";
import { IconButton, Panel } from "./controls";
import { EnhancePanel } from "./enhance-panel";
import { fileToDataUrl, IMAGE_TYPES, MAX_IMAGE_BYTES } from "./image-utils";
import { AiPanel, TracePanel, useAiPrompt } from "./image-tools";
import { PreviewStrip } from "./pin-preview";
import { ShapesPanel } from "./shapes-panel";
import { describeUsage, DiscardDialog, UpdateEverywhereDialog } from "./studio-dialogs";
import { StudioCanvas } from "./studio-canvas";
import { TOOLS, type Tool } from "./tools";
import { useCanvasGestures } from "./use-canvas-gestures";
import { useImageSource } from "./use-image-source";
import { useShapeHistory } from "./use-shape-history";

export type SavedShape = RouterOutputs["maps"]["shape"]["create"];

const ANCHORS = [
  { id: "center", label: "Centred" },
  { id: "bottom", label: "Bottom tip" },
] as const;

const asNodes = (points: Pt[]): Node[] => points.map(([x, y]) => ({ x, y, smooth: true }));

/**
 * Pin Studio — the shape editor, as a full-page dialog over whatever opened
 * it (a pin / hotspot / template form keeps everything filled in).
 *
 * All tools are on the left rail (a strip under the top bar on phones):
 * Select and Pen edit points, Freehand draws a whole shape, Shapes starts from
 * a built-in, Trace turns an image into an outline, and AI makes one from a
 * description (optionally with a reference image or link). Every shape is a
 * list of points, each a corner or smooth; only the outline is ever saved.
 *
 * Next to the rail: the shape's name and pin preview (always in view), then the
 * current tool's options. "Enhance with AI" redraws the outline and shows it
 * beside the original to choose from.
 */
export function ShapeStudio({
  open,
  onOpenChange,
  editing,
  creatorId,
  brandImage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An existing shape to change; omitted for a new one. */
  editing?: { id: string; name: string; path: string; anchor: string } | null;
  /** An admin working for a brand: whose library to save into. */
  creatorId?: string;
  brandImage?: string | null;
  onSaved?: (shape: SavedShape) => void;
}) {
  const [tool, setTool] = useState<Tool>("pen");
  const [name, setName] = useState("");
  const [anchor, setAnchor] = useState<ShapeAnchor>("center");
  const [selected, setSelected] = useState<number | null>(null);
  const [snap, setSnap] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showLogo, setShowLogo] = useState(true);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const history = useShapeHistory();
  const { nodes, lockedPath, touched, commit, replace } = history;
  const { undo: undoStep, redo: redoStep } = history;

  // Shapes tool
  const [base, setBase] = useState<Base | null>(null);
  const [options, setOptions] = useState<BaseOptions>(DEFAULT_BASE_OPTIONS);

  // Trace and AI both turn an image into an outline.
  const src = useImageSource();
  const aiPrompt = useAiPrompt();
  const showEnhance = src.source?.from === "enhance";

  // Enhance with AI (redraws the current outline)
  const [enhanceAsk, setEnhanceAsk] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [overlay, setOverlay] = useState(false);

  // Start fresh each time it opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const editable = editing ? pathToNodes(editing.path) : null;
      history.reset(editable ?? [], editing && !editable ? editing.path : null);
      setName(editing?.name ?? "");
      setAnchor(editing?.anchor === "bottom" ? "bottom" : "center");
      setSelected(null);
      setTool(editing ? "select" : "pen");
      setBase(null);
      src.reset();
      aiPrompt.reset();
      setEnhanceAsk(false);
      setInstruction("");
      setOverlay(false);
      setZoom(1);
    }
  }

  const undo = useCallback(() => (undoStep(), setSelected(null)), [undoStep]);
  const redo = useCallback(() => (redoStep(), setSelected(null)), [redoStep]);

  // ── The outline and its checks ─────────────────────────────────────────
  const editable = nodes.length >= 3;
  const path = lockedPath ?? (editable ? nodesToPath(nodes) : "");
  const isEdited = !editing || touched;
  const problems: string[] = [];
  if (isEdited && !lockedPath)
    problems.push(...outlineProblems(nodes.map((p) => [p.x, p.y] as Pt)));
  const check = path ? checkShapePath(path) : null;
  if (path && check && !check.ok && problems.length === 0) problems.push(check.error);
  const cleanPath = check?.ok ? check.path : path;
  const canSave = Boolean(name.trim()) && Boolean(path) && problems.length === 0;
  // Not a problem, but worth knowing: a thin shape holds little of the logo and looks small on a map.
  const coverage = path && problems.length === 0 ? pathCoverage(path) : 1;
  const thin = coverage > 0 && coverage < THIN_SHAPE_COVERAGE;
  // Anything the brand would lose by closing now.
  const dirty =
    touched ||
    name.trim() !== (editing?.name ?? "") ||
    anchor !== (editing?.anchor === "bottom" ? "bottom" : "center");
  /** Close, but ask first when there are unsaved changes (Escape, Cancel, clicking outside). */
  const requestClose = () => (dirty ? setConfirmDiscard(true) : onOpenChange(false));

  // ── Saving ─────────────────────────────────────────────────────────────
  const utils = api.useUtils();
  const usage = api.maps.shape.usage.useQuery(
    { id: editing?.id ?? "" },
    { enabled: open && Boolean(editing) },
  );
  const done = (shape: SavedShape, verb: string) => {
    void utils.maps.shape.list.invalidate();
    void utils.maps.pin.getMyPins.invalidate();
    toast.success(`${verb} “${shape.name}”`);
    onSaved?.(shape);
    onOpenChange(false);
  };
  const create = api.maps.shape.create.useMutation({
    onSuccess: (s) => done(s, "Saved shape"),
    onError: (e) => toast.error(e.message),
  });
  const update = api.maps.shape.update.useMutation({
    onSuccess: (s) => done(s, "Updated"),
    onError: (e) => toast.error(e.message),
  });
  const busy = create.isPending || update.isPending;
  const saveNew = () => create.mutate({ name: name.trim(), path: cleanPath, anchor, creatorId });
  const saveInPlace = () =>
    editing &&
    update.mutate({
      id: editing.id,
      name: name.trim(),
      anchor,
      ...(touched ? { path: cleanPath } : {}),
    });
  const onSave = () => {
    if (!canSave || busy) return;
    if (!editing) return saveNew();
    if ((usage.data?.total ?? 0) > 0) setConfirmSave(true);
    else saveInPlace();
  };

  // ── Drawing ────────────────────────────────────────────────────────────
  const canvas = useCanvasGestures({
    tool,
    snap,
    history,
    setSelected,
    onFreehand: (drawn) => {
      commit(drawn);
      setSelected(null);
      setTool("select");
    },
  });

  const removeSelected = useCallback(() => {
    if (selected === null) return;
    commit(nodes.filter((_, i) => i !== selected));
    setSelected(null);
  }, [selected, nodes, commit]);

  // Keyboard: undo / redo, delete the selected point, V/P/F tool keys.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable=true]"))
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) {
        e.preventDefault();
        removeSelected();
      } else if (!mod && e.key === "v") setTool("select");
      else if (!mod && e.key === "p") setTool("pen");
      else if (!mod && e.key === "f") setTool("freehand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, undo, redo, removeSelected, selected]);

  // ── Shapes tool ────────────────────────────────────────────────────────
  const applyBase = (b: Base, o = options, newStep = true) => {
    setBase(b);
    const next = baseNodes(b, o);
    if (newStep) commit(next);
    else replace(next);
    setSelected(null);
  };
  const changeOptions = (patch: Partial<BaseOptions>) => {
    const o = { ...options, ...patch };
    setOptions(o);
    if (base) applyBase(base, o, false);
  };

  // ── Trace, AI and Enhance: an image becomes an outline ────────────────
  const useTraced = () => {
    if (!src.traced) return;
    commit(asNodes(src.traced.points));
    setSelected(null);
    setTool("select");
    toast.success("Outline added — edit any point you like");
  };
  const onTraceFile = async (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.test(file.type))
      return void toast.error("Use a PNG, JPG, WebP, GIF or SVG image");
    if (file.size > MAX_IMAGE_BYTES) return void toast.error("That image is over 8 MB");
    await src.load(await fileToDataUrl(file, 640), "trace");
  };

  const ai = api.maps.shape.ai.useMutation({
    onSuccess: (r) => void src.load(r.image, "ai"),
    onError: (e) => toast.error(e.message),
  });
  const generate = () =>
    ai.mutate({
      creatorId,
      description: aiPrompt.description.trim(),
      referenceImage: aiPrompt.refImage?.dataUrl,
      referenceUrl: aiPrompt.refUrl.trim() || undefined,
      rights: src.rights,
    });

  const enhance = api.maps.shape.enhance.useMutation({
    onSuccess: (r) => {
      setEnhanceAsk(false);
      void src.load(r.image, "enhance");
    },
    onError: (e) => toast.error(e.message),
  });
  const runEnhance = () =>
    !enhance.isPending &&
    editable &&
    enhance.mutate({
      creatorId,
      path: nodesToPath(nodes),
      instruction: instruction.trim() || undefined,
    });
  const useEnhanced = () => {
    if (!src.traced) return;
    commit(asNodes(src.traced.points));
    setSelected(null);
    src.clear();
    toast.success("Enhanced — edit any point you like, or ⌘Z to go back");
  };
  const closeEnhance = () => {
    setEnhanceAsk(false);
    if (showEnhance) src.clear();
  };

  // ── Whole-shape actions ────────────────────────────────────────────────
  const actions: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: "Flip ↔", icon: FlipHorizontal2, run: () => commit(flipNodes(nodes, "x")) },
    { label: "Flip ↕", icon: FlipVertical2, run: () => commit(flipNodes(nodes, "y")) },
    {
      label: "All smooth",
      icon: Spline,
      run: () => commit(nodes.map((p) => ({ ...p, smooth: true }))),
    },
    {
      label: "All corners",
      icon: Squircle,
      run: () => commit(nodes.map((p) => ({ ...p, smooth: false }))),
    },
    {
      label: "Enhance with AI",
      icon: Sparkles,
      run: () => {
        setTool("select");
        setSelected(null);
        setEnhanceAsk(true);
      },
    },
  ];

  const sel = selected !== null ? nodes[selected] : undefined;
  const logo = showLogo ? (brandImage ?? null) : null;
  // A trace or AI outline waiting to be used, drawn dashed over the drawing.
  const waiting =
    src.traced &&
    (showEnhance || ((tool === "trace" || tool === "ai") && src.source?.from === tool))
      ? src.traced.path
      : null;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && (o ? onOpenChange(true) : requestClose())}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none"
        >
          {/* Top bar */}
          <header className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
            <DialogTitle className="font-hud truncate text-base sm:text-lg">
              {editing ? "Edit shape" : "New shape"}
            </DialogTitle>
            <div className="ml-2 hidden items-center gap-1 sm:flex">
              <IconButton
                label="Undo (⌘Z)"
                icon={Undo2}
                disabled={!history.canUndo}
                onClick={undo}
              />
              <IconButton
                label="Redo (⇧⌘Z)"
                icon={Redo2}
                disabled={!history.canRedo}
                onClick={redo}
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={requestClose}>
                <X /> <span className="hidden sm:inline">Cancel</span>
              </Button>
              <Button type="button" size="sm" disabled={!canSave || busy} onClick={onSave}>
                {busy && <Loader2 className="animate-spin" />}
                Save<span className="hidden sm:inline"> shape</span>
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Tool rail (a strip on phones) */}
            <nav
              aria-label="Tools"
              className="flex shrink-0 gap-1 overflow-x-auto border-b p-1.5 lg:w-[76px] lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0 lg:p-2"
            >
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tool === t.id}
                  title={t.hint}
                  onClick={() => (setTool(t.id), closeEnhance())}
                  className={cn(
                    "flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors",
                    tool === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <t.icon className="size-[18px]" />
                  {t.label}
                </button>
              ))}
              <div className="flex shrink-0 items-center gap-1 sm:hidden">
                <IconButton label="Undo" icon={Undo2} disabled={!history.canUndo} onClick={undo} />
                <IconButton label="Redo" icon={Redo2} disabled={!history.canRedo} onClick={redo} />
              </div>
            </nav>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
              {/* Canvas */}
              <section className="flex min-w-0 flex-1 flex-col items-center gap-3 p-3 sm:p-5 lg:overflow-y-auto">
                {showEnhance ? (
                  <CompareView
                    before={{ path, points: nodes.length }}
                    after={
                      src.traced
                        ? { path: src.traced.path, points: src.traced.points.length }
                        : null
                    }
                    overlay={overlay}
                    onOverlay={setOverlay}
                    detail={src.detail}
                    onDetail={src.setDetail}
                    logo={logo}
                    onUse={useEnhanced}
                    onTryAgain={() => setEnhanceAsk(true)}
                    onKeep={closeEnhance}
                  />
                ) : (
                  <StudioCanvas
                    tool={tool}
                    hint={TOOLS.find((t) => t.id === tool)!.hint}
                    path={path}
                    nodes={nodes}
                    selected={selected}
                    stroke={canvas.stroke}
                    pending={waiting}
                    zoom={zoom}
                    onZoom={setZoom}
                    snap={snap}
                    onSnap={setSnap}
                    canClear={nodes.length > 0 || Boolean(lockedPath)}
                    onClear={() => {
                      commit([]);
                      setSelected(null);
                    }}
                    svgRef={canvas.svgRef}
                    handlers={canvas.handlers}
                  />
                )}
              </section>

              {/* Options: next to the tool rail */}
              <aside className="flex w-full shrink-0 flex-col border-t lg:order-first lg:w-[320px] lg:overflow-hidden lg:border-t-0 lg:border-r">
                <PreviewStrip
                  name={name}
                  onName={setName}
                  path={path}
                  logo={brandImage}
                  showLogo={showLogo}
                  onShowLogo={setShowLogo}
                />
                <div className="space-y-6 p-4 lg:flex-1 lg:overflow-y-auto">
                  {(tool === "select" || tool === "pen") && (
                    <Panel title={sel ? `Point ${selected! + 1} of ${nodes.length}` : "Points"}>
                      {sel ? (
                        <div className="flex flex-wrap gap-2">
                          <Segmented
                            label="Point type"
                            value={sel.smooth ? "smooth" : "corner"}
                            options={[
                              { id: "corner", label: "Corner" },
                              { id: "smooth", label: "Smooth" },
                            ]}
                            onChange={(v) =>
                              commit(
                                nodes.map((p, i) =>
                                  i === selected ? { ...p, smooth: v === "smooth" } : p,
                                ),
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={removeSelected}
                          >
                            <Trash2 /> Remove
                          </Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          {nodes.length
                            ? `${nodes.length} points. Click one to change it.`
                            : lockedPath
                              ? "This shape can't be edited point by point. Draw, pick a shape, trace or use AI to replace it."
                              : "Click on the canvas to place the first point."}
                        </p>
                      )}
                    </Panel>
                  )}

                  {tool === "freehand" && (
                    <Panel title="Freehand">
                      <p className="text-muted-foreground text-sm">
                        Press and drag all the way round your shape, then let go. It closes itself
                        and becomes smooth points you can edit.
                      </p>
                    </Panel>
                  )}

                  {tool === "shapes" && (
                    <ShapesPanel
                      base={base}
                      options={options}
                      onPick={applyBase}
                      onOptions={changeOptions}
                    />
                  )}

                  {tool === "trace" && (
                    <TracePanel src={src} onFile={(f) => void onTraceFile(f)} onUse={useTraced} />
                  )}

                  {tool === "ai" && (
                    <AiPanel
                      src={src}
                      prompt={aiPrompt}
                      pending={ai.isPending}
                      onGenerate={generate}
                      onUse={useTraced}
                    />
                  )}

                  {editable && (
                    <Panel title="Whole shape">
                      <div className="flex flex-wrap gap-1.5">
                        {actions.map((a) => (
                          <Button
                            key={a.label}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={a.run}
                          >
                            <a.icon /> {a.label}
                          </Button>
                        ))}
                      </div>
                      <EnhancePanel
                        open={enhanceAsk}
                        instruction={instruction}
                        onInstruction={setInstruction}
                        pending={enhance.isPending}
                        canRun={editable}
                        hasResult={showEnhance}
                        onRun={runEnhance}
                        onClose={() => setEnhanceAsk(false)}
                      />
                    </Panel>
                  )}

                  <div className="space-y-2">
                    <Label>Where it touches the map</Label>
                    <Segmented
                      label="Where it touches the map"
                      value={anchor}
                      options={ANCHORS}
                      onChange={setAnchor}
                    />
                  </div>

                  {(problems.length > 0 || !name.trim()) && (
                    <ul className="text-warning space-y-1 text-sm" aria-live="polite">
                      {problems.map((p) => (
                        <li key={p}>• {p}</li>
                      ))}
                      {!name.trim() && <li>• Give the shape a name</li>}
                    </ul>
                  )}
                  {thin && (
                    <p
                      className="border-warning/40 bg-warning/5 text-warning rounded-lg border p-3 text-sm"
                      role="note"
                    >
                      This shape is thin — it fills only {Math.round(coverage * 100)}% of its box.
                      Your logo will be hard to read inside it, and on the map it will look smaller
                      than other pins (it is drawn a little larger to help). A chunkier outline
                      works better.
                    </p>
                  )}
                  {editing && usage.data && usage.data.total > 0 && (
                    <p className="text-muted-foreground text-sm">
                      Used by {describeUsage(usage.data)}.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DiscardDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        editing={Boolean(editing)}
        onDiscard={() => (setConfirmDiscard(false), onOpenChange(false))}
      />
      <UpdateEverywhereDialog
        open={confirmSave}
        onOpenChange={setConfirmSave}
        usage={usage.data}
        busy={busy}
        onSaveNew={() => (setConfirmSave(false), saveNew())}
        onUpdateAll={() => (setConfirmSave(false), saveInPlace())}
      />
    </>
  );
}
