import { format, isSameDay } from "date-fns";
import { Lock } from "lucide-react-native";
import { View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { Skeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import type { ThreadMessage } from "~/lib/api/types";
import { useColors } from "~/theme/theme";

/** Port of the web ChatPanel: the private thread with the brand. */
export function ChatPanel({ messages, loading, brand }: { messages: ThreadMessage[] | undefined; loading: boolean; brand: { name: string; avatarUrl: string | null } }) {
  const { c } = useColors();
  if (loading) {
    return (
      <View className="gap-2.5">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-10 w-2/3 self-end" />
      </View>
    );
  }
  const list = messages ?? [];
  return (
    <View>
      <View className="mb-4 flex-row items-center justify-center gap-1.5">
        <Lock size={10} strokeWidth={2.6} color={c("ar-text-faint")} />
        <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.5px] text-ar-faint">Only you and {brand.name} can see this</Text>
      </View>
      {list.length === 0 ? (
        <View className="items-center py-8">
          <BrandAvatar src={brand.avatarUrl} style={{ width: 48, height: 48, borderRadius: 14 }} />
          <Text className="mt-3 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">Not sure what counts? Ask {brand.name} directly before you send your entry.</Text>
        </View>
      ) : (
        list.map((m, i) => {
          const prev = list[i - 1];
          const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
          const grouped = prev && !newDay && prev.fromBrand === m.fromBrand;
          return (
            <View key={m.id}>
              {newDay && <Text className="font-hud my-3 text-center text-[9.5px] font-semibold uppercase tracking-[1.5px] text-ar-faint">{format(new Date(m.createdAt), "d MMM yyyy")}</Text>}
              <View className="flex-row items-end gap-2" style={{ justifyContent: m.fromBrand ? "flex-start" : "flex-end", marginTop: grouped ? 6 : 12 }}>
                {m.fromBrand && <View style={{ width: 28 }}>{!grouped && <BrandAvatar src={brand.avatarUrl} style={{ width: 28, height: 28, borderRadius: 9 }} />}</View>}
                <View
                  style={{
                    maxWidth: "78%",
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    ...(m.fromBrand
                      ? { borderBottomLeftRadius: 6, borderWidth: 1, borderColor: c("ar-line"), backgroundColor: c("ar-text", 0.05) }
                      : { borderBottomRightRadius: 6, borderWidth: 1, borderColor: c("ar-green", 0.4), backgroundColor: c("ar-green", 0.2) }),
                  }}
                >
                  <Text className="text-[13.5px] leading-5 text-ar-text">
                    {m.content}
                    <Text className="font-hud text-[9px] text-ar-faint">{`  ${format(new Date(m.createdAt), "HH:mm")}`}</Text>
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
