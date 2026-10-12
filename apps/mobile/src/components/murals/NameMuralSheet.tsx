import { Check, PencilLine } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Field, FormError } from "~/components/ui/Field";
import { Text } from "~/components/ui/Text";
import { useNameMural } from "~/lib/murals/api";
import { useColors } from "~/theme/theme";

/**
 * Optional "Name this mural" sheet — any of the first finders, first to save
 * wins (plan §12.3). Keyed by the caller per open, so it always starts empty.
 */
export function NameMuralSheet({ muralId, autoTitle, open, onClose }: { muralId: string; autoTitle: string; open: boolean; onClose: () => void }) {
  const { c } = useColors();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const name = useNameMural();
  const valid = title.trim().length >= 2;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PencilLine size={17} strokeWidth={2.4} color={c("rarity-epic")} />
          <Text className="font-hud text-[16px] font-bold text-ar-text">Name this mural</Text>
        </View>
        <Text className="mt-1 text-[12px] leading-[18px] text-ar-dim">
          You&apos;re one of its first finders. Give it a name people will see on the map — or skip and it stays “{autoTitle}”.
        </Text>

        {name.data ? (
          <View style={{ marginTop: 18, alignItems: "center", borderRadius: 16, borderWidth: 1, borderColor: c("ar-line"), padding: 16 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c("ar-green", 0.6), backgroundColor: c("ar-green", 0.15), alignItems: "center", justifyContent: "center" }}>
              <Check size={18} strokeWidth={3} color={c("ar-green-hot")} />
            </View>
            <Text className="font-hud mt-2 text-[14px] font-bold text-ar-text">{name.data.title}</Text>
            {name.data.artist && <Text className="text-[12px] text-ar-dim">by {name.data.artist}</Text>}
            <Text className="mt-2 text-[11.5px] text-ar-faint">{name.data.named ? "Saved — that's its name now." : "Another finder named it first."}</Text>
            <View style={{ alignSelf: "stretch", marginTop: 14 }}>
              <ArButton variant="primary" size="md" onPress={onClose}>
                Done
              </ArButton>
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 14, gap: 12 }}>
            <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} placeholder="e.g. Blue Heron" autoFocus />
            <Field label="Artist (if you know)" value={artist} onChangeText={setArtist} maxLength={80} placeholder="Artist or crew" />
            <FormError message={name.error ? name.error.message : null} />
            <ArButton
              variant="primary"
              size="md"
              disabled={!valid || name.isPending}
              onPress={() => name.mutate({ muralId, title: title.trim(), artist: artist.trim() ? artist.trim() : undefined })}
            >
              {name.isPending ? "Saving…" : "Save name"}
            </ArButton>
            <ArButton variant="ghost" size="md" onPress={onClose}>
              Skip
            </ArButton>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
