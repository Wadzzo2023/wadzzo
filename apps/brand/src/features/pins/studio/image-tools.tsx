import { ImageUp, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Checkbox } from "@wadzzo/ui/components/checkbox";
import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { RangeField } from "@wadzzo/ui/patterns/range-field";
import { Button } from "@wadzzo/ui/poster/button";
import { Input } from "@wadzzo/ui/poster/input";
import { Textarea } from "@wadzzo/ui/poster/textarea";

import { IconButton, Panel } from "./controls";
import { fileToReferenceDataUrl, MAX_IMAGE_BYTES } from "./image-utils";
import type { ImageSourceState } from "./use-image-source";

// The Trace and AI tools: both end in "an image, and the outline it would make".

/** What the brand typed and attached for the AI tool; kept while they switch tools. */
export function useAiPrompt() {
  const [description, setDescription] = useState("");
  const [refImage, setRefImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [refUrl, setRefUrl] = useState("");
  return {
    description,
    setDescription,
    refImage,
    setRefImage,
    refUrl,
    setRefUrl,
    hasReference: Boolean(refImage) || Boolean(refUrl.trim()),
    reset: () => {
      setDescription("");
      setRefImage(null);
      setRefUrl("");
    },
  };
}
export type AiPrompt = ReturnType<typeof useAiPrompt>;

function RightsCheck({
  what,
  checked,
  onChange,
}: {
  what: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor="shape-rights"
      className="flex items-start gap-2.5 rounded-lg border p-2.5 text-xs"
    >
      <Checkbox
        id="shape-rights"
        checked={checked}
        onCheckedChange={(c) => onChange(c === true)}
        className="mt-0.5"
      />
      <span>
        I own this {what} or have permission to use it.
        <span className="text-muted-foreground block">
          Only the outline is kept — images aren&apos;t saved.
        </span>
      </span>
    </label>
  );
}

/** The picture, the outline it makes, and the settings to adjust it, until the brand uses it. */
function SourceResult({
  kind,
  src,
  onUse,
}: {
  kind: "trace" | "ai";
  src: ImageSourceState;
  onUse: () => void;
}) {
  const { source, traced } = src;
  if (source?.from !== kind) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source.url}
          alt={kind === "ai" ? "AI result" : "Your image"}
          className="bg-card aspect-square w-full rounded-lg border object-contain"
        />
        <svg viewBox="-2 -2 104 104" className="bg-card aspect-square w-full rounded-lg border">
          {traced && (
            <path d={traced.path} className="fill-primary/20 stroke-primary" strokeWidth={0.8} />
          )}
        </svg>
      </div>
      <RangeField
        label="Detail"
        min={0}
        max={1}
        step={0.05}
        value={src.detail}
        onChange={src.setDetail}
        left="Smooth"
        right="Precise"
      />
      {kind === "trace" && (
        <>
          <RangeField
            label="Threshold"
            min={40}
            max={240}
            step={5}
            value={src.threshold}
            onChange={src.setThreshold}
            left="Only dark"
            right="Lighter too"
          />
          <label className="flex items-center justify-between text-sm">
            Invert (trace the light part)
            <Switch checked={src.invert} onCheckedChange={src.setInvert} />
          </label>
        </>
      )}
      <Button
        type="button"
        className="w-full"
        disabled={!traced || (kind === "trace" && !src.rights)}
        onClick={onUse}
      >
        Use this outline
      </Button>
      {!traced && (
        <p className="text-warning text-xs">Nothing to trace — try Invert or the threshold.</p>
      )}
      {kind === "trace" && traced && !src.rights && (
        <p className="text-warning text-xs">Confirm you can use this image first.</p>
      )}
    </div>
  );
}

/** Trace: turn an uploaded logo or sketch into an outline. */
export function TracePanel({
  src,
  onFile,
  onUse,
}: {
  src: ImageSourceState;
  onFile: (file: File | undefined) => void;
  onUse: () => void;
}) {
  return (
    <Panel title="Trace an image">
      <label className="hover:border-primary/60 flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed p-4 text-center">
        <Upload className="text-muted-foreground size-5" />
        <span className="text-sm font-medium">
          {src.source?.from === "trace" ? "Choose another image" : "Upload a logo or sketch"}
        </span>
        <span className="text-muted-foreground text-xs">
          Transparent PNG works best · up to 8 MB
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      <RightsCheck what="artwork" checked={src.rights} onChange={src.setRights} />
      <SourceResult kind="trace" src={src} onUse={onUse} />
    </Panel>
  );
}

/** AI: describe a shape, optionally with a reference image or link. */
export function AiPanel({
  src,
  prompt,
  pending,
  onGenerate,
  onUse,
}: {
  src: ImageSourceState;
  prompt: AiPrompt;
  pending: boolean;
  onGenerate: () => void;
  onUse: () => void;
}) {
  const canGenerate =
    prompt.description.trim().length >= 3 && (!prompt.hasReference || src.rights) && !pending;

  const onReference = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type))
      return void toast.error("Use a PNG, JPG or WebP image");
    if (file.size > MAX_IMAGE_BYTES) return void toast.error("That image is over 8 MB");
    const dataUrl = await fileToReferenceDataUrl(file).catch(() => null);
    if (!dataUrl)
      return void toast.error("That image is too large or can't be read — try a smaller one");
    prompt.setRefImage({ dataUrl, name: file.name });
  };

  return (
    <Panel title="Make it with AI">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ai-description">Describe the shape</Label>
          <Textarea
            id="ai-description"
            rows={3}
            maxLength={600}
            className="resize-none"
            placeholder="e.g. a friendly forest troll with shaggy hair and a big nose"
            value={prompt.description}
            onChange={(e) => prompt.setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Reference (optional)</Label>
          {prompt.refImage ? (
            <div className="flex items-center gap-2 rounded-lg border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={prompt.refImage.dataUrl}
                alt=""
                className="size-10 rounded object-contain"
              />
              <span className="min-w-0 flex-1 truncate text-xs">{prompt.refImage.name}</span>
              <IconButton
                label="Remove reference image"
                icon={X}
                onClick={() => prompt.setRefImage(null)}
                small
              />
            </div>
          ) : (
            <label className="hover:border-primary/60 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-2.5 text-xs">
              <ImageUp className="size-4" /> Upload a reference image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => void onReference(e.target.files?.[0])}
              />
            </label>
          )}
          <Input
            type="url"
            inputMode="url"
            placeholder="…or paste a link to an image or page"
            value={prompt.refUrl}
            onChange={(e) => prompt.setRefUrl(e.target.value)}
          />
        </div>
        <Button type="button" className="w-full" disabled={!canGenerate} onClick={onGenerate}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pending ? "Making your shape…" : src.source?.from === "ai" ? "Try again" : "Generate"}
        </Button>
        <p className="text-muted-foreground text-xs">Uses one of your daily AI images.</p>
      </div>
      {prompt.hasReference && (
        <RightsCheck what="reference" checked={src.rights} onChange={src.setRights} />
      )}
      <SourceResult kind="ai" src={src} onUse={onUse} />
    </Panel>
  );
}
