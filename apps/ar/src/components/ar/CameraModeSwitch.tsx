import { motion } from "framer-motion";
import { Frame, QrCode, ScanLine } from "lucide-react";
import { useRouter } from "~/lib/navigation";

import { cn } from "@wadzzo/ui/lib/cn";

const MODES = [
  { id: "ar", href: "/ar", label: "AR", icon: ScanLine },
  { id: "qr", href: "/scan", label: "QR", icon: QrCode },
  { id: "murals", href: "/murals", label: "ART", icon: Frame },
] as const;

/** Murals wear the launcher tile's epic purple; the other two stay green. */
const ACTIVE = {
  ar: { pill: "border-ar-green/50 bg-ar-green/20 shadow-[0_0_14px_-4px_hsl(var(--ar-green)/0.8)]", icon: "text-ar-green-hot" },
  qr: { pill: "border-ar-green/50 bg-ar-green/20 shadow-[0_0_14px_-4px_hsl(var(--ar-green)/0.8)]", icon: "text-ar-green-hot" },
  murals: { pill: "border-rarity-epic/60 bg-rarity-epic/25 shadow-[0_0_14px_-4px_hsl(var(--rarity-epic)/0.8)]", icon: "text-rarity-epic" },
} as const;

export type CameraMode = (typeof MODES)[number]["id"];

/**
 * ── CameraModeSwitch ───────────────────────────────────────────────────────
 *
 * The one camera behind the AR tab, three ways to use it: look around for
 * drops (AR), point at a printed code (QR), or scan street art (Murals —
 * labelled "ART" so three pills fit). They stay separate routes —
 * `/scan?pin=<id>` is what every printed code already encodes — and this
 * switch just moves between them.
 *
 * `router.replace`, not `push`: flipping modes is a setting on the same
 * screen, not a place you went. "Exit" should take you back to wherever you
 * opened the camera from, not step back through every toggle.
 *
 * Sits over live video, so it's glass like the rest of the camera chrome
 * rather than the bevelled `SegmentedTabs` used on flat screens.
 */
export function CameraModeSwitch({
  mode,
  className,
}: {
  mode: CameraMode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <div
      role="tablist"
      aria-label="Camera mode"
      className={cn(
        "ar-glass pointer-events-auto flex h-9 gap-0.5 rounded-full p-[3px]",
        className,
      )}
    >
      {MODES.map((m) => {
        const active = m.id === mode;
        const Icon = m.icon;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) void router.replace(m.href);
            }}
            className="relative flex w-[58px] items-center justify-center gap-1 rounded-full"
          >
            {active && (
              <motion.span
                layoutId="camera-mode"
                className={cn("absolute inset-0 rounded-full border", ACTIVE[m.id].pill)}
                transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.7 }}
              />
            )}
            <Icon
              size={12}
              strokeWidth={2.5}
              className={cn(
                "relative z-10",
                active ? ACTIVE[m.id].icon : "text-ar-faint",
              )}
            />
            <span
              className={cn(
                "font-hud relative z-10 text-[11px] font-bold tracking-[0.12em]",
                active ? "text-ar-text" : "text-ar-faint",
              )}
            >
              {m.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
