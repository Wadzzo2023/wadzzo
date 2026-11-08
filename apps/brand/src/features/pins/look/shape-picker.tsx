"use client";

import { Check, ChevronsUpDown, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { BUILTIN_SHAPE_IDS, BUILTIN_SHAPES } from "@wadzzo/schemas/pin-look";
import { cn } from "@wadzzo/ui/lib/cn";
import { PinGlyph } from "@wadzzo/ui/patterns/pin-glyph";
import { Popover, PopoverContent, PopoverTrigger } from "@wadzzo/ui/poster/popover";

export type ShapeOption = { id: string; name: string; path: string; own: boolean };

const BUILTINS: ShapeOption[] = BUILTIN_SHAPE_IDS.map((id) => ({
  id,
  name: BUILTIN_SHAPES[id].name,
  path: BUILTIN_SHAPES[id].path,
  own: false,
}));

/** One shape as a tile: the shape with the pin's picture and colour in it, and its full name. */
function ShapeTile({
  shape,
  selected,
  color,
  imageUrl,
  onPick,
  onEdit,
}: {
  shape: ShapeOption;
  selected: boolean;
  color: string | null;
  imageUrl: string | null;
  onPick: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onPick}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-2 transition-colors",
          selected ? "border-primary bg-primary/10" : "hover:bg-muted border-transparent",
        )}
      >
        <PinGlyph
          path={shape.path}
          size={40}
          color={color}
          defaultColor="hsl(var(--muted))"
          imageUrl={imageUrl}
          ringColor={selected ? "hsl(var(--primary))" : "hsl(var(--border))"}
          ringWidth={2}
        />
        <span className="line-clamp-2 min-h-8 w-full text-center text-[11px] leading-4 break-words">
          {shape.name}
        </span>
      </button>
      {selected && (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${shape.name} in Pin Studio`}
          title="Edit in Pin Studio"
          className="bg-card text-muted-foreground hover:text-foreground absolute top-1 left-1 hidden size-5 items-center justify-center rounded-full border group-hover:flex focus-visible:flex"
        >
          <Pencil className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Choose a pin's shape. Shows the chosen one; opens a panel with search, the brand's own shapes
 * (to edit, or add a new one) and the built-in ones, each drawn with the pin's picture and colour.
 */
export function ShapePicker({
  value,
  own,
  onChange,
  onNew,
  onEdit,
  color,
  imageUrl,
}: {
  value: string;
  /** The brand's saved shapes. */
  own: { id: string; name: string; path: string }[];
  onChange: (id: string) => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  color: string | null;
  imageUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const yours = useMemo<ShapeOption[]>(() => own.map((s) => ({ ...s, own: true })), [own]);
  const current = [...yours, ...BUILTINS].find((s) => s.id === value) ?? BUILTINS[0]!;
  const matches = (s: ShapeOption) =>
    !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase());
  const mine = yours.filter(matches);
  const builtIn = BUILTINS.filter(matches);
  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Pin shape: ${current.name}. Change`}
          className="hover:border-line-bright bg-card flex h-14 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors"
        >
          <PinGlyph
            path={current.path}
            size={36}
            color={color}
            defaultColor="hsl(var(--muted))"
            imageUrl={imageUrl}
            ringColor="hsl(var(--primary))"
            ringWidth={2}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{current.name}</span>
            <span className="text-muted-foreground block text-xs">
              {current.own ? "Your shape" : "Built-in shape"}
            </span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(23rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search shapes"
              aria-label="Search shapes"
              className="placeholder:text-muted-foreground h-9 w-full bg-transparent pr-2 pl-8 text-sm outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => (close(), onNew())}
            className="bg-primary text-primary-foreground flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
          >
            <Plus className="size-3.5" /> New shape
          </button>
        </div>
        <div
          className="max-h-80 space-y-4 overflow-y-auto p-2"
          role="radiogroup"
          aria-label="Pin shape"
        >
          {mine.length > 0 && (
            <section>
              <h4 className="text-muted-foreground px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                Your shapes
              </h4>
              <div className="grid grid-cols-4 gap-1">
                {mine.map((s) => (
                  <ShapeTile
                    key={s.id}
                    shape={s}
                    selected={value === s.id}
                    color={color}
                    imageUrl={imageUrl}
                    onPick={() => (onChange(s.id), close())}
                    onEdit={() => (close(), onEdit(s.id))}
                  />
                ))}
              </div>
            </section>
          )}
          {builtIn.length > 0 && (
            <section>
              <h4 className="text-muted-foreground px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                Built-in
              </h4>
              <div className="grid grid-cols-4 gap-1">
                {builtIn.map((s) => (
                  <ShapeTile
                    key={s.id}
                    shape={s}
                    selected={value === s.id}
                    color={color}
                    imageUrl={imageUrl}
                    onPick={() => (onChange(s.id), close())}
                  />
                ))}
              </div>
            </section>
          )}
          {mine.length === 0 && builtIn.length === 0 && (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              No shape is called “{q.trim()}”. Make it with <b>New shape</b>.
            </p>
          )}
          {yours.length === 0 && !q.trim() && (
            <p className="text-muted-foreground bg-surface-2 rounded-lg px-3 py-2 text-xs">
              Draw, trace or generate a shape of your own with <b>New shape</b>. It appears here for
              every pin.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
