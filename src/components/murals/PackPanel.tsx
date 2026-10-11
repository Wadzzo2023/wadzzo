import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Lightbulb, RotateCcw, ShieldCheck, TriangleAlert, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

import { ArButton } from "~/components/ui/ArButton";
import { formatBytes, packProgress, startMuralPack, useMuralPack, type PackStatus } from "~/lib/murals/pack";
import { cn } from "~/lib/utils";

import { PackArt } from "./PackArt";

/**
 * ── PackPanel ──────────────────────────────────────────────────────────────
 *
 * The game-style "resource download" panel for the mural pack: emblem with a
 * progress ring, stage track (Connect → Download → Verify → Ready), a big
 * striped bar with %, speed and time left, and rotating tips. No cancel —
 * by design (2026-10-05) — but it never blocks the rest of the app.
 *
 * `compact` is the strip under the Murals camera while the pack installs.
 */

export const PACK_TIPS = [
  "Graffiti counts too — any street art can be collected.",
  "The first 3 people to find a mural earn a discovery bonus.",
  "Turn slowly left, then right: it proves the wall is real.",
  "You can scan each mural up to 3 times a day.",
  "Name a mural you discovered — everyone sees it on the map.",
  "Photos of a screen don't count. Find the real wall!",
];

const STAGES: { key: PackStatus[]; label: string }[] = [
  { key: ["checking"], label: "Connect" },
  { key: ["downloading"], label: "Download" },
  { key: ["verifying"], label: "Verify" },
  { key: ["ready"], label: "Ready" },
];
const stageIndex = (s: PackStatus) => (s === "checking" ? 0 : s === "downloading" ? 1 : s === "verifying" ? 2 : s === "ready" ? 3 : 1);

function eta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
}

function useTip(enabled: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setI((n) => (n + 1) % PACK_TIPS.length), 4500);
    return () => clearInterval(t);
  }, [enabled]);
  return PACK_TIPS[i]!;
}

export function PackBar({ progress, active, failed }: { progress: number; active: boolean; failed?: boolean }) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full border border-white/10 bg-ar-void/60">
      <motion.div
        className={cn("absolute inset-y-0 left-0 rounded-full", failed ? "bg-ar-danger" : "bg-linear-to-r from-cyan-400 via-rarity-epic to-fuchsia-500")}
        initial={false}
        animate={{ width: `${Math.max(2, progress * 100)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      >
        {active && <span className="ar-pack-stripes absolute inset-0 opacity-40" />}
        {active && <span className="absolute right-0 top-0 h-full w-6 bg-white/50 blur-[6px]" />}
      </motion.div>
    </div>
  );
}

export function PackPanel({ compact = false }: { compact?: boolean }) {
  const s = useMuralPack();
  const p = packProgress(s);
  const pct = Math.floor(p * 100);
  const active = s.status === "downloading" || s.status === "checking" || s.status === "verifying";
  const tip = useTip(active);
  const failed = s.status === "error";
  const done = s.status === "ready";
  const si = stageIndex(s.status);

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <PackArt size={46} progress={p} done={done} spinning={s.status === "checking" || s.status === "verifying"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-hud truncate text-[11px] font-bold uppercase tracking-[0.14em] text-ar-text">
              {failed ? "Mural pack paused" : done ? "Mural pack ready" : s.status === "verifying" ? "Verifying files…" : "Downloading mural pack"}
            </p>
            <p className="font-hud text-[13px] font-bold tabular-nums text-rarity-epic">{done ? "100%" : `${pct}%`}</p>
          </div>
          <div className="mt-1.5">
            <PackBar progress={done ? 1 : p} active={active} failed={failed} />
          </div>
          <p className="mt-1 truncate text-[10.5px] text-ar-faint">
            {failed
              ? s.error?.message
              : s.status === "downloading"
                ? `${formatBytes(s.receivedBytes)} / ${formatBytes(s.totalBytes)} · ${formatBytes(s.speed)}/s · ${eta((s.totalBytes - s.receivedBytes) / Math.max(1, s.speed))} left`
                : tip}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-2 pt-1">
      <div className="flex items-center gap-4">
        <PackArt size={92} progress={p} done={done} spinning={s.status === "checking" || s.status === "verifying"} />
        <div className="min-w-0">
          <p className="font-hud text-[10px] font-semibold uppercase tracking-[0.28em] text-rarity-epic">Resource pack</p>
          <h2 className="font-hud text-[20px] font-bold leading-tight text-ar-text">Mural Pack {s.version ? `v${s.version}` : ""}</h2>
          <p className="mt-0.5 text-[11.5px] text-ar-dim">The street-art finder for the Murals camera · {s.totalBytes ? formatBytes(s.totalBytes) : "≈23 MB"}</p>
        </div>
      </div>

      {/* Stage track */}
      <ol className="mt-5 flex items-center">
        {STAGES.map((st, i) => {
          const reached = i < si || done;
          const current = i === si && !done;
          return (
            <li key={st.label} className="flex flex-1 items-center last:flex-none">
              <span className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                    reached ? "border-rarity-epic bg-rarity-epic text-white" : current ? (failed ? "border-ar-danger text-ar-danger" : "border-rarity-epic text-rarity-epic") : "border-ar-line text-ar-faint",
                  )}
                >
                  {reached ? <Check size={12} strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn("font-hud mt-1 text-[9px] font-bold uppercase tracking-[0.12em]", reached || current ? "text-ar-text" : "text-ar-faint")}>{st.label}</span>
              </span>
              {i < STAGES.length - 1 && <span className={cn("mx-1 mb-4 h-[2px] flex-1", i < si || done ? "bg-rarity-epic" : "bg-ar-line")} />}
            </li>
          );
        })}
      </ol>

      {/* Big bar */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="font-hud text-[12px] font-bold uppercase tracking-[0.12em] text-ar-text">
            {failed ? "Paused" : done ? "Installed" : s.status === "verifying" ? "Verifying files…" : s.status === "checking" ? "Connecting…" : "Downloading"}
          </p>
          <p className="font-hud text-[26px] font-bold leading-none tabular-nums text-rarity-epic">{done ? 100 : pct}%</p>
        </div>
        <PackBar progress={done ? 1 : p} active={active} failed={failed} />
        <div className="mt-2 grid grid-cols-3 text-[11px] text-ar-dim">
          <span className="tabular-nums">
            {formatBytes(done ? s.totalBytes : s.receivedBytes)} / {s.totalBytes ? formatBytes(s.totalBytes) : "—"}
          </span>
          <span className="text-center tabular-nums">{s.status === "downloading" ? `${formatBytes(s.speed)}/s` : "—"}</span>
          <span className="text-right tabular-nums">{s.status === "downloading" ? `${eta((s.totalBytes - s.receivedBytes) / Math.max(1, s.speed))} left` : "—"}</span>
        </div>
      </div>

      {failed && s.error && (
        <div className="mt-4 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-3">
          <p className="flex items-start gap-2 text-[12px] text-ar-text">
            {s.error.code === "offline" ? <Wifi size={15} className="mt-0.5 shrink-0 text-ar-danger" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0 text-ar-danger" />}
            {s.error.message}
          </p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-ar-faint">{s.retryIn != null ? `Retrying in ${s.retryIn}s` : ""}</span>
            <ArButton size="sm" variant="outline" icon={RotateCcw} onClick={() => void startMuralPack()}>
              Retry now
            </ArButton>
          </div>
        </div>
      )}

      {done ? (
        <p className="mt-4 flex items-center gap-2 rounded-ar border border-ar-green/40 bg-ar-green/10 px-3.5 py-2.5 text-[12px] text-ar-text">
          <ShieldCheck size={15} className="text-ar-green-hot" /> Verified and installed. The Murals camera is ready.
        </p>
      ) : (
        !failed && (
          <div className="mt-4 flex min-h-[44px] items-start gap-2 rounded-ar border border-ar-line bg-white/[0.03] px-3.5 py-2.5">
            <Lightbulb size={15} className="mt-0.5 shrink-0 text-rarity-legendary" />
            <AnimatePresence mode="wait">
              <motion.p key={tip} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-[12px] leading-relaxed text-ar-dim">
                {tip}
              </motion.p>
            </AnimatePresence>
          </div>
        )
      )}

      {!done && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10.5px] text-ar-faint">
          <Download size={11} /> Keep using Wadzzo — this finishes in the background.
        </p>
      )}
    </div>
  );
}
