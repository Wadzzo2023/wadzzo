import { CheckCircle2, Download, Loader2, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { ArButton } from "~/components/ui/ArButton";
import { deleteMuralPack, formatBytes, packProgress, startMuralPack, useMuralPack, verifyMuralPack } from "~/lib/murals/pack";
import { cn } from "~/lib/utils";

import { PackArt } from "./PackArt";
import { PackBar } from "./PackPanel";

/**
 * ── Settings › Mural pack ──────────────────────────────────────────────────
 *
 * Status, version and size; Download / Repair (the manual fallback if the
 * background install ever gets stuck); Verify now (re-hash, repair if
 * damaged); Delete (frees ~23 MB — it comes back on the next app open).
 */
export function MuralPackSettings() {
  const s = useMuralPack();
  const [busy, setBusy] = useState<null | "verify" | "delete">(null);
  const [note, setNote] = useState<string | null>(null);
  const p = packProgress(s);
  const working = s.status === "checking" || s.status === "downloading" || s.status === "verifying";

  const label =
    s.status === "ready"
      ? "Ready"
      : s.status === "downloading"
        ? `Downloading ${Math.floor(p * 100)}%`
        : s.status === "verifying"
          ? "Verifying…"
          : s.status === "checking"
            ? "Checking…"
            : s.status === "error"
              ? s.error?.code === "damaged"
                ? "Damaged — repairing"
                : "Paused"
              : "Not downloaded";

  return (
    <div className="rounded-ar border border-ar-line bg-white/[0.03] p-3.5">
      <div className="flex items-center gap-3">
        <PackArt size={52} progress={p} done={s.status === "ready"} spinning={s.status === "checking" || s.status === "verifying"} />
        <div className="min-w-0 flex-1">
          <p className="font-hud text-[12.5px] font-bold uppercase tracking-[0.1em] text-ar-text">Mural pack</p>
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1 text-[11.5px]",
              s.status === "ready" ? "text-ar-green-hot" : s.status === "error" ? "text-ar-danger" : "text-ar-dim",
            )}
          >
            {s.status === "ready" ? <CheckCircle2 size={12} /> : s.status === "error" ? <TriangleAlert size={12} /> : working ? <Loader2 size={12} className="animate-spin" /> : null}
            {label}
          </p>
          <p className="mt-0.5 text-[10.5px] text-ar-faint">
            {s.version ? `v${s.version} · ` : ""}
            {s.totalBytes ? formatBytes(s.totalBytes) : "≈23 MB"} · needed for the Murals camera
          </p>
        </div>
      </div>

      {working && (
        <div className="mt-3">
          <PackBar progress={p} active />
        </div>
      )}
      {s.status === "error" && s.error && <p className="mt-2 text-[11.5px] text-ar-danger">{s.error.message}</p>}
      {note && <p className="mt-2 text-[11.5px] text-ar-dim">{note}</p>}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <ArButton size="sm" variant={s.status === "ready" ? "outline" : "primary"} icon={Download} disabled={working} onClick={() => void startMuralPack()}>
          {s.status === "ready" ? "Re-check" : s.status === "error" ? "Repair" : "Download"}
        </ArButton>
        <ArButton
          size="sm"
          variant="outline"
          icon={ShieldCheck}
          disabled={working || busy != null || s.status !== "ready"}
          onClick={() => {
            setBusy("verify");
            setNote(null);
            void verifyMuralPack()
              .then((r) => setNote(r === "ok" ? "Verified — every byte matches." : r === "damaged" ? "It was damaged; a fresh copy is downloading." : "It was missing; downloading it now."))
              .finally(() => setBusy(null));
          }}
        >
          {busy === "verify" ? "Verifying…" : "Verify"}
        </ArButton>
        <ArButton
          size="sm"
          variant="ghost"
          icon={Trash2}
          disabled={working || busy != null || s.status === "idle"}
          onClick={() => {
            setBusy("delete");
            void deleteMuralPack()
              .then(() => setNote("Deleted. It downloads again next time you open Wadzzo."))
              .finally(() => setBusy(null));
          }}
        >
          Delete
        </ArButton>
      </div>
    </div>
  );
}
