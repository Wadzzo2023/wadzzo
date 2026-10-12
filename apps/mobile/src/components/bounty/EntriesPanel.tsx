import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Image } from "expo-image";
import { Pencil, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { TonePill } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { api } from "~/lib/api/client";
import { useEntriesQuery } from "~/lib/api/queries";
import type { Entry } from "~/lib/api/types";
import { ENTRY_STATUS } from "~/lib/ar/bounty";
import { useColors } from "~/theme/theme";

import { formatBytes, mediaIcon } from "./EntrySheet";
import { RichText } from "./RichText";

const STEP_LABEL = ["Sent", "Seen", "In review", "Decision"];
const stepIndex = (s: Entry["status"]) => (s === "APPROVED" || s === "REJECTED" ? 3 : ["UNCHECKED", "CHECKED", "ONREVIEW"].indexOf(s));

/** Port of the web EntriesPanel: your entries, each with its review track. */
export function EntriesPanel({ bountyId, open, onEdit }: { bountyId: number; open: boolean; onEdit: (e: Entry) => void }) {
  const entries = useEntriesQuery(bountyId, true);
  if (entries.isLoading) return <Skeleton className="h-[132px] w-full" />;
  if (entries.isError) return <Text className="rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5 text-[12px] text-ar-danger">Couldn't load your entries.</Text>;
  const list = entries.data ?? [];
  if (!list.length) {
    return (
      <View className="items-center py-10">
        <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">No entries yet</Text>
        <Text className="mt-1.5 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">
          {open ? "Read the brief, do the thing, then send it in with the button below." : "This bounty closed before you sent anything."}
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-3">
      {list.map((e, i) => (
        <EntryCard key={e.id} entry={e} number={list.length - i} editable={open} onEdit={() => onEdit(e)} bountyId={bountyId} />
      ))}
    </View>
  );
}

function EntryCard({ entry, number, editable, onEdit, bountyId }: { entry: Entry; number: number; editable: boolean; onEdit: () => void; bountyId: number }) {
  const { c } = useColors();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const status = ENTRY_STATUS[entry.status];
  const step = stepIndex(entry.status);
  const images = entry.medias.filter((m) => m.type.startsWith("image/"));
  const files = entry.medias.filter((m) => !m.type.startsWith("image/"));

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/entries/${entry.id}`, { method: "DELETE" });
      await Promise.all(["entries", "bounty", "myBounties"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Bevel className="rounded-ar-lg p-3.5" style={{ borderRadius: 22 }}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.6px] text-ar-faint">
          Entry {number} · {format(new Date(entry.createdAt), "d MMM, HH:mm")}
        </Text>
        <TonePill tone={status.tone} label={status.label} />
      </View>
      <View className="mt-3 flex-row gap-1" accessibilityLabel={`Review status: ${status.label}`}>
        {STEP_LABEL.map((label, i) => {
          const reached = i <= step;
          const final = i === 3 && step === 3;
          return (
            <View key={label} className="flex-1 gap-1">
              <View className="h-1 rounded-full" style={{ backgroundColor: !reached ? c("ar-text", 0.07) : final && entry.status === "REJECTED" ? c("ar-danger") : c("ar-green-hot") }} />
              <Text className="font-hud text-[8.5px] font-semibold uppercase tracking-[1px]" style={{ color: reached ? c("ar-text-dim") : c("ar-text-faint", 0.6) }}>
                {final ? status.label : label}
              </Text>
            </View>
          );
        })}
      </View>
      <RichText html={entry.content} className="mt-3" />
      {images.length > 0 && (
        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {images.map((m) => (
            <Pressable key={m.url} onPress={() => void Linking.openURL(m.url)} style={{ width: "32%", aspectRatio: 1, borderRadius: 10, overflow: "hidden" }}>
              <Image source={{ uri: m.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      )}
      {files.map((m) => {
        const Icon = mediaIcon(m.type);
        return (
          <Pressable key={m.url} onPress={() => void Linking.openURL(m.url)} className="mt-2 flex-row items-center gap-2.5 rounded-ar border border-ar-line bg-ar-text/5 px-3 py-2">
            <Icon size={15} strokeWidth={2.2} color={c("ar-text-dim")} />
            <Text numberOfLines={1} className="flex-1 text-[12px] text-ar-text">{m.name}</Text>
            <Text className="font-hud text-[10px] text-ar-faint">{formatBytes(m.size)}</Text>
          </Pressable>
        );
      })}
      {editable && (
        <View className="mt-3 flex-row items-center gap-2 border-t border-ar-line pt-3">
          <Pressable onPress={onEdit} className="h-8 flex-row items-center gap-1.5 rounded-full border border-ar-line px-3">
            <Pencil size={11} strokeWidth={2.5} color={c("ar-text-dim")} />
            <Text className="font-hud text-[10.5px] font-semibold uppercase tracking-[1px] text-ar-dim">Edit</Text>
          </Pressable>
          <Pressable
            onPress={() => (confirming ? void remove() : setConfirming(true))}
            disabled={busy}
            className="h-8 flex-row items-center gap-1.5 rounded-full border px-3"
            style={{ borderColor: confirming ? c("ar-danger", 0.6) : c("ar-line"), backgroundColor: confirming ? c("ar-danger", 0.15) : "transparent" }}
          >
            <Trash2 size={11} strokeWidth={2.5} color={confirming ? c("ar-danger") : c("ar-text-dim")} />
            <Text className="font-hud text-[10.5px] font-semibold uppercase tracking-[1px]" style={{ color: confirming ? c("ar-danger") : c("ar-text-dim") }}>
              {busy ? "Deleting…" : confirming ? "Tap to confirm" : "Delete"}
            </Text>
          </Pressable>
          {err && <Text className="text-[11px] text-ar-danger">{err}</Text>}
        </View>
      )}
    </Bevel>
  );
}
