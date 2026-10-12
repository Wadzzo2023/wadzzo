import { useQueryClient } from "@tanstack/react-query";
import { Camera, FileText, Film, Image as ImageIcon, Music, Paperclip, Send, X, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { FormError } from "~/components/ui/Field";
import { Text } from "~/components/ui/Text";
import { api } from "~/lib/api/client";
import type { Entry } from "~/lib/api/types";
import { uploadFiles, type LocalFile, type Uploaded } from "~/lib/api/upload";
import { ENTRY_FILE_TYPES, MAX_ENTRY_FILE_BYTES, MAX_ENTRY_FILES } from "~/lib/ar/entryFiles";
import { captureWithCamera, pickFromLibrary } from "~/lib/media";
import { useColors } from "~/theme/theme";

import { htmlToText } from "./RichText";

export function mediaIcon(type: string): LucideIcon {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.startsWith("video/")) return Film;
  if (type.startsWith("audio/")) return Music;
  return FileText;
}
export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

function problem(f: LocalFile) {
  if (!(ENTRY_FILE_TYPES as readonly string[]).includes(f.type)) return "This file type can't be attached";
  if (f.size > MAX_ENTRY_FILE_BYTES) return "Over the 1 GB limit";
  return null;
}

/**
 * Port of the web EntrySheet: plain text + up to five attachments, uploaded
 * only on Send, each with its own progress. Native addition (approved):
 * attach straight from the camera.
 */
export function EntrySheet({ bountyId, open, onClose, editing }: { bountyId: number; open: boolean; onClose: () => void; editing?: Entry | null }) {
  const { c } = useColors();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [kept, setKept] = useState<Uploaded[]>([]);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const editingId = editing?.id;
  useEffect(() => {
    if (!open) return;
    setText(editing ? htmlToText(editing.content) : "");
    setKept(editing?.medias.map(({ url, name, size, type }) => ({ url, name, size, type })) ?? []);
    setFiles([]);
    setProgress({});
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const total = kept.length + files.length;
  const add = (picked: LocalFile[] | null) => {
    if (!picked?.length) return;
    const bad = picked.map((f) => [f, problem(f)] as const).find(([, p]) => p);
    if (bad) return setError(`${bad[0].name}: ${bad[1]}`);
    if (total + picked.length > MAX_ENTRY_FILES) return setError(`Up to ${MAX_ENTRY_FILES} attachments per entry`);
    setError(null);
    setFiles((f) => [...f, ...picked]);
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadFiles(files, `/bounties/${bountyId}/uploads`, {}, (i, pct) => setProgress((p) => ({ ...p, [i]: pct })));
      const medias = [...kept, ...uploaded];
      if (editing) await api(`/entries/${editing.id}`, { method: "PATCH", body: { content: text, medias } });
      else await api(`/bounties/${bountyId}/entries`, { method: "POST", body: { content: text, medias } });
      await Promise.all(["entries", "bounty", "myBounties"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your entry");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={busy ? () => undefined : onClose} dismissible={!busy} maxHeight="92%">
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <Text className="font-hud text-[17px] font-bold text-ar-text">{editing ? "Edit entry" : "Send an entry"}</Text>
        <Pressable onPress={onClose} disabled={busy} accessibilityLabel="Close">
          <X size={18} strokeWidth={2.4} color={c("ar-text-faint")} />
        </Pressable>
      </View>
      <ScrollView className="px-5" keyboardShouldPersistTaps="handled">
        <TextInput
          value={text}
          onChangeText={setText}
          editable={!busy}
          multiline
          maxLength={5000}
          placeholder="What did you do? Links, context, anything the brand should know."
          placeholderTextColor={c("ar-text-faint")}
          accessibilityLabel="Your entry"
          className="min-h-[140px] rounded-ar border border-ar-line bg-ar-surface-2 p-3.5 text-[14px] leading-5 text-ar-text"
          style={{ fontFamily: "Sora_400Regular", textAlignVertical: "top" }}
        />
        <View className="mt-3 gap-2">
          {kept.map((m) => (
            <FileRow key={m.url} name={m.name} type={m.type} size={m.size} sub={`${formatBytes(m.size)} · attached`} onRemove={busy ? undefined : () => setKept((k) => k.filter((x) => x.url !== m.url))} />
          ))}
          {files.map((f, i) => (
            <FileRow key={`${f.uri}-${i}`} name={f.name} type={f.type} size={f.size} progress={busy ? (progress[i] ?? 0) : undefined} onRemove={busy ? undefined : () => setFiles((fs) => fs.filter((_, j) => j !== i))} />
          ))}
        </View>
        {total < MAX_ENTRY_FILES && (
          <View className="mt-2 flex-row gap-2">
            <Pressable onPress={async () => add(await pickFromLibrary({ images: true, videos: true, multiple: true, limit: MAX_ENTRY_FILES - total }))} disabled={busy} className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-ar border border-dashed border-ar-line-bright">
              <Paperclip size={15} strokeWidth={2.3} color={c("ar-text-dim")} />
              <Text className="text-[12.5px] font-semibold text-ar-dim">Photos & video</Text>
            </Pressable>
            <Pressable onPress={async () => add(await captureWithCamera({ video: true }))} disabled={busy} className="h-11 flex-1 flex-row items-center justify-center gap-2 rounded-ar border border-dashed border-ar-line-bright">
              <Camera size={15} strokeWidth={2.3} color={c("ar-text-dim")} />
              <Text className="text-[12.5px] font-semibold text-ar-dim">Camera</Text>
            </Pressable>
          </View>
        )}
        <Text className="mt-1.5 text-center text-[10.5px] text-ar-faint">{total}/{MAX_ENTRY_FILES} attachments</Text>
        <View className="mt-3">
          <FormError message={error} />
        </View>
      </ScrollView>
      <View className="px-5 pt-3">
        <ArButton variant="primary" size="lg" block icon={Send} busy={busy} disabled={text.trim().length < 2} onPress={() => void send()}>
          {busy ? (files.length ? "Uploading…" : "Sending…") : editing ? "Save changes" : "Send entry"}
        </ArButton>
      </View>
    </BottomSheet>
  );
}

function FileRow({ name, type, size, sub, progress, onRemove }: { name: string; type: string; size: number; sub?: string; progress?: number; onRemove?: () => void }) {
  const { c } = useColors();
  const Icon = mediaIcon(type);
  return (
    <View className="flex-row items-center gap-3 overflow-hidden rounded-ar border border-ar-line bg-ar-text/5 px-3 py-2.5">
      {progress != null && <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progress}%`, backgroundColor: c("ar-green", 0.1) }} />}
      <Icon size={16} strokeWidth={2.2} color={c("ar-text-dim")} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[12.5px] text-ar-text">{name}</Text>
        <Text className="font-hud text-[10px] text-ar-faint">{progress != null ? `${progress}%` : (sub ?? formatBytes(size))}</Text>
      </View>
      {onRemove && (
        <Pressable onPress={onRemove} accessibilityLabel={`Remove ${name}`} hitSlop={8}>
          <X size={15} strokeWidth={2.4} color={c("ar-text-faint")} />
        </Pressable>
      )}
    </View>
  );
}
