import { CheckCircle2, Download, ShieldCheck, Trash2, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { ArButton } from "~/components/ui/ArButton";
import { Text } from "~/components/ui/Text";
import { deleteMuralPack, formatBytes, packProgress, startMuralPack, useMuralPack, verifyMuralPack } from "~/lib/murals/pack";
import { useColors } from "~/theme/theme";

import { PackArt } from "./PackArt";
import { PackBar } from "./PackPanel";

/**
 * Settings › Mural pack (mobile port): status, version, size; Download /
 * Repair (manual fallback), Verify now (re-hash, repair if damaged), Delete
 * (frees ~23 MB — it comes back on the next app open).
 */
export function MuralPackSettings() {
  const { c } = useColors();
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
  const tone = s.status === "ready" ? c("ar-green-hot") : s.status === "error" ? c("ar-danger") : c("ar-text-dim");

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c("ar-line"), padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <PackArt size={52} progress={p} done={s.status === "ready"} spinning={s.status === "checking" || s.status === "verifying"} />
        <View style={{ flex: 1 }}>
          <Text className="font-hud text-[12.5px] font-bold uppercase tracking-[1.2px] text-ar-text">Mural pack</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            {s.status === "ready" && <CheckCircle2 size={12} color={tone} />}
            {s.status === "error" && <TriangleAlert size={12} color={tone} />}
            <Text className="text-[11.5px]" style={{ color: tone }}>
              {label}
            </Text>
          </View>
          <Text className="mt-0.5 text-[10.5px] text-ar-faint">
            {s.version ? `v${s.version} · ` : ""}
            {s.totalBytes ? formatBytes(s.totalBytes) : "≈23 MB"} · needed for the Murals camera
          </Text>
        </View>
      </View>

      {working && (
        <View style={{ marginTop: 12 }}>
          <PackBar progress={p} active />
        </View>
      )}
      {s.status === "error" && s.error && <Text className="mt-2 text-[11.5px] text-ar-danger">{s.error.message}</Text>}
      {note && <Text className="mt-2 text-[11.5px] text-ar-dim">{note}</Text>}

      <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <ArButton size="sm" variant={s.status === "ready" ? "outline" : "primary"} icon={Download} disabled={working} onPress={() => void startMuralPack()}>
            {s.status === "ready" ? "Re-check" : s.status === "error" ? "Repair" : "Download"}
          </ArButton>
        </View>
        <View style={{ flex: 1 }}>
          <ArButton
            size="sm"
            icon={ShieldCheck}
            disabled={working || busy != null || s.status !== "ready"}
            onPress={() => {
              setBusy("verify");
              setNote(null);
              void verifyMuralPack()
                .then((r) => setNote(r === "ok" ? "Verified — every byte matches." : r === "damaged" ? "It was damaged; a fresh copy is downloading." : "It was missing; downloading it now."))
                .finally(() => setBusy(null));
            }}
          >
            {busy === "verify" ? "Verifying…" : "Verify"}
          </ArButton>
        </View>
        <View style={{ flex: 1 }}>
          <ArButton
            size="sm"
            variant="ghost"
            icon={Trash2}
            disabled={working || busy != null || s.status === "idle"}
            onPress={() => {
              setBusy("delete");
              void deleteMuralPack()
                .then(() => setNote("Deleted. It downloads again next time you open Wadzzo."))
                .finally(() => setBusy(null));
            }}
          >
            Delete
          </ArButton>
        </View>
      </View>
    </View>
  );
}
