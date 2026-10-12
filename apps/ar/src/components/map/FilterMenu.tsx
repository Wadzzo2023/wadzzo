import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Chip } from "~/components/ui/Badges";
import type { PinFilterId } from "~/lib/ar/usePins";
import { cn } from "~/lib/utils";

/**
 * The map's filter rail, collapsed: only the active filter shows as a chip.
 * Clicking it drops the other filters 4px below; picking one (or clicking
 * anywhere else, or Escape) closes it.
 */
export function FilterMenu({
  filters,
  value,
  onChange,
  className,
}: {
  filters: { id: PinFilterId; label: string }[];
  value: PinFilterId;
  onChange: (id: PinFilterId) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = filters.find((f) => f.id === value) ?? filters[0];
  const others = filters.filter((f) => f.id !== current?.id);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <Chip active onClick={() => setOpen((o) => !o)}>
        {current?.label}
        <ChevronDown
          size={13}
          strokeWidth={2.6}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </Chip>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-[calc(100%+4px)] z-40 flex flex-col items-start gap-1"
          >
            {others.map((f) => (
              <Chip
                key={f.id}
                // Solid backing: the chip's own fill is translucent, and over
                // the map a dropdown needs to read as sitting above it.
                className="bg-ar-surface"
                onClick={() => {
                  onChange(f.id);
                  setOpen(false);
                }}
              >
                {f.label}
              </Chip>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
