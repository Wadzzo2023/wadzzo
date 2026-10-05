import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Camera,
  Check,
  MapPin,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { packProgress, useMuralPack } from "~/lib/murals/pack";
import {
  readCameraPermissions,
  type PermAnswers,
} from "~/lib/ar/cameraPermissions";

import {
  CAMERA_MODES,
  tone,
  type CameraModeDef,
  type CameraPerm,
} from "./modes";

const PERM_ICONS: Record<CameraPerm, LucideIcon> = {
  camera: Camera,
  location: MapPin,
};
const PERM_TITLES: Record<CameraPerm, string> = {
  camera: "Camera",
  location: "Location",
};

/**
 * ── CameraLauncher ─────────────────────────────────────────────────────────
 *
 * Port of the mobile app's launcher: what the AR button opens. A centred
 * dialog with a bento of the camera's three ways in (AR hero card, QR and
 * Murals tiles), each showing whether its permissions are already allowed.
 *
 * Unlike mobile there's no "allow access" step in here — picking a mode goes
 * straight to its page, whose own gate asks (see lib/ar/cameraPermissions.ts
 * for why the browser can't ask from here).
 */
export function CameraLauncher({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [perms, setPerms] = useState<PermAnswers>({});

  // Fresh read every time it opens, and when the tab comes back into view
  // (the viewer may have just changed a site setting).
  useEffect(() => {
    if (!open) return;
    let live = true;
    const refresh = () =>
      void readCameraPermissions().then((p) => {
        if (live) setPerms(p);
      });
    refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const pick = (mode: CameraModeDef) => {
    if (!mode.href) return;
    onClose();
    void router.push(mode.href);
  };

  const [ar, qr, murals] = CAMERA_MODES as [
    CameraModeDef,
    CameraModeDef,
    CameraModeDef,
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            aria-hidden
            onClick={onClose}
            className="absolute inset-0 bg-ar-void/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-launcher-title"
            className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] border border-ar-line bg-ar-surface py-4"
            // Same pop as the mobile Dialog: scale 0.92 → 1, fade, small rise.
            initial={{ opacity: 0, scale: 0.92, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 8,
              transition: { duration: 0.16 },
            }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <div className="px-4">
              <div className="flex items-start gap-3 px-1 pb-4">
                <div className="flex-1">
                  <p className="font-hud text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-faint">
                    Camera
                  </p>
                  <h2
                    id="camera-launcher-title"
                    className="font-hud mt-1 text-[21px] font-bold leading-7 text-ar-text"
                  >
                    How do you want to collect?
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ar-line bg-ar-surface-2 text-ar-dim"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} />
                </button>
              </div>
              <div className="flex flex-col gap-3">
                <BentoCard
                  mode={ar}
                  perms={perms}
                  hero
                  index={0}
                  onPick={pick}
                />
                <div className="flex gap-3">
                  <BentoCard mode={qr} perms={perms} index={1} onPick={pick} />
                  <BentoCard
                    mode={murals}
                    perms={perms}
                    index={2}
                    onPick={pick}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function BentoCard({
  mode,
  perms,
  hero = false,
  index,
  onPick,
}: {
  mode: CameraModeDef;
  perms: PermAnswers;
  hero?: boolean;
  index: number;
  onPick: (m: CameraModeDef) => void;
}) {
  const soon = mode.href === null;
  const Icon = mode.icon;

  return (
    <motion.button
      type="button"
      disabled={soon}
      onClick={() => onPick(mode)}
      aria-label={
        soon ? `${mode.title}, coming soon` : `${mode.title}. ${mode.blurb}`
      }
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 380,
        damping: 30,
        delay: 0.06 + index * 0.06,
      }}
      whileTap={soon ? undefined : { scale: 0.97 }}
      className={`relative flex flex-col overflow-hidden rounded-[22px] border bg-ar-surface-2 text-left ${hero ? "min-h-[178px] w-full p-[18px]" : "min-h-[176px] flex-1 p-3.5"} ${soon ? "cursor-default" : ""}`}
      style={{
        borderColor: tone(mode.accent, soon ? 0.2 : 0.38),
        backgroundImage: `linear-gradient(135deg, ${tone(mode.accent, soon ? 0.08 : 0.2)}, ${tone(mode.accent, 0.02)})`,
      }}
    >
      <span
        aria-hidden
        className="ar-grid pointer-events-none absolute inset-0 opacity-[0.06]"
      />
      {/* Oversized mark bleeding off the corner — the card's texture. */}
      <Icon
        aria-hidden
        strokeWidth={1.2}
        className={`pointer-events-none absolute -rotate-[10deg] ${hero ? "-bottom-[22px] -right-[18px] h-[132px] w-[132px]" : "-bottom-4 -right-3.5 h-[92px] w-[92px]"}`}
        style={{ color: tone(mode.accent, soon ? 0.07 : 0.13) }}
      />

      <div className="relative flex items-start justify-between">
        <span
          className={`flex items-center justify-center rounded-[13px] border ${hero ? "h-[46px] w-[46px]" : "h-10 w-10"}`}
          style={{
            borderColor: tone(mode.accent, soon ? 0.25 : 0.5),
            backgroundColor: tone(mode.accent, soon ? 0.08 : 0.18),
          }}
        >
          <Icon
            strokeWidth={2.2}
            className={hero ? "h-[22px] w-[22px]" : "h-[19px] w-[19px]"}
            style={{ color: tone(mode.accentHot, soon ? 0.55 : 1) }}
          />
        </span>
        {soon ? (
          <span
            className="font-hud rounded-full border px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.16em]"
            style={{
              borderColor: tone(mode.accent, 0.4),
              backgroundColor: tone(mode.accent, 0.14),
              color: tone(mode.accentHot),
            }}
          >
            Soon
          </span>
        ) : (
          <span
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full"
            style={{ backgroundColor: tone(mode.accentHot) }}
          >
            <ArrowUpRight className="h-4 w-4 text-ar-void" strokeWidth={2.6} />
          </span>
        )}
      </div>

      <div
        className={`relative flex flex-1 flex-col justify-end ${hero ? "mt-[18px]" : "mt-3.5"} ${soon ? "opacity-60" : ""}`}
      >
        <p
          className={`font-hud truncate font-bold text-ar-text ${hero ? "text-[20px]" : "text-[15px]"}`}
        >
          {mode.title}
        </p>
        <p
          className={`mt-1 text-ar-dim ${hero ? "line-clamp-2 max-w-[16rem] text-[12.5px] leading-5" : "line-clamp-3 text-[11.5px] leading-[17px]"}`}
        >
          {mode.blurb}
        </p>
        {!soon && <Readiness mode={mode} perms={perms} />}
        {mode.id === "murals" && <PackChip />}
      </div>
    </motion.button>
  );
}

/** Murals tile: the pack's install state, with a mini bar while it downloads. */
function PackChip() {
  const s = useMuralPack();
  if (s.status === "ready") {
    return (
      <p className="font-hud mt-2 flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-ar-green-hot">
        <Check className="h-3 w-3" strokeWidth={3} /> Mural pack ready
      </p>
    );
  }
  if (s.status === "idle") return null;
  const pct = Math.floor(packProgress(s) * 100);
  return (
    <div className="mt-2">
      <p className="font-hud flex items-center justify-between text-[9.5px] font-bold uppercase tracking-[0.14em] text-rarity-epic">
        <span>{s.status === "error" ? "Pack paused" : s.status === "verifying" ? "Verifying pack" : "Downloading pack"}</span>
        <span className="tabular-nums">{s.status === "error" ? "" : `${pct}%`}</span>
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ar-void/60">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-rarity-epic transition-[width] duration-300" style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
    </div>
  );
}

/** Which permissions this mode uses, each ticked once allowed, plus a verdict. */
function Readiness({
  mode,
  perms,
}: {
  mode: CameraModeDef;
  perms: PermAnswers;
}) {
  const known = mode.needs.every((k) => perms[k] != null);
  const ready = mode.needs.every((k) => perms[k] === "granted");
  return (
    <div className="mt-3 flex items-center gap-1.5">
      {mode.needs.map((k) => {
        const granted = perms[k] === "granted";
        const I = PERM_ICONS[k];
        return (
          <span
            key={k}
            aria-label={`${PERM_TITLES[k]} ${granted ? "allowed" : "not allowed yet"}`}
            className={`relative flex h-6 w-6 items-center justify-center rounded-full border ${granted ? "border-ar-green/50 bg-ar-green/15 text-ar-green-hot" : "border-ar-line bg-ar-surface/80 text-ar-faint"}`}
          >
            <I className="h-3 w-3" strokeWidth={2.3} />
            {granted && (
              <span className="absolute -bottom-[3px] -right-[3px] flex h-3 w-3 items-center justify-center rounded-full bg-ar-green-hot">
                <Check className="h-2 w-2 text-ar-void" strokeWidth={4} />
              </span>
            )}
          </span>
        );
      })}
      {known && (
        <span
          className={`font-hud ml-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] ${ready ? "text-ar-green-hot" : "text-ar-faint"}`}
        >
          {ready ? "Ready" : "Needs access"}
        </span>
      )}
    </div>
  );
}
