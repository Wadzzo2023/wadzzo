import { router } from "expo-router";
import { Footprints, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { ArTrail } from "~/lib/api/types";
import { distanceLabel, MODE_VERB, trailColor } from "~/lib/ar/trails";
import { useColors } from "~/theme/theme";

import { TrailShape } from "./TrailShape";

/** A trail in the list: its outline, brand, stops and distance, and my progress once started. */
export function TrailCard({ trail: t }: { trail: ArTrail }) {
  const { c } = useColors();
  const color = trailColor(t);
  const { done, total, complete } = t.progress;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/trails/[id]", params: { id: t.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${t.title}, ${total} stops`}
    >
      <Bevel className="flex-row items-center rounded-ar-lg p-3" style={{ borderRadius: 22, gap: 12 }}>
        <View className="items-center justify-center rounded-ar" style={{ width: 72, height: 72, backgroundColor: c("ar-text", 0.04) }}>
          <TrailShape trail={t} size={68} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.5px] text-ar-dim" numberOfLines={1}>
            {t.brand.name}
          </Text>
          <Text className="text-[15px] font-semibold text-ar-text" numberOfLines={1}>
            {t.title}
          </Text>
          <View className="mt-0.5 flex-row items-center" style={{ gap: 5 }}>
            <Footprints size={11} color={c("ar-text-faint")} />
            <Text className="text-[11.5px] text-ar-faint">
              {total} stops · {distanceLabel(t.distanceMetres)} · ~{t.estMinutes} min {MODE_VERB[t.mode] ?? ""}
            </Text>
          </View>
          {t.run ? (
            <View className="mt-2 flex-row items-center" style={{ gap: 8 }}>
              <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: c("ar-text", 0.1) }}>
                <View className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }} />
              </View>
              <Text className="font-hud text-[10.5px] font-semibold text-ar-dim">{complete ? "Done" : `${done}/${total}`}</Text>
            </View>
          ) : (
            t.runners > 0 && (
              <View className="mt-1 flex-row items-center" style={{ gap: 5 }}>
                <Users size={11} color={c("ar-text-faint")} />
                <Text className="text-[11px] text-ar-faint">{t.runners} following</Text>
              </View>
            )
          )}
        </View>
      </Bevel>
    </Pressable>
  );
}

export function TrailCardSkeleton() {
  return <Skeleton className="h-[96px] w-full rounded-ar-lg" />;
}
