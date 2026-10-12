import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Check, Globe, MapPin, Users } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { TonePill } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Glass, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { ArEventCard } from "~/lib/api/types";
import { dateTile, eventWhen, liveState, spotsLabel } from "~/lib/ar/events";
import { useColors } from "~/theme/theme";

/** Port of the web EventCard: date tile first, then what, when, where, how full. */
export function EventCard({ event }: { event: ArEventCard }) {
  const { c } = useColors();
  const tile = dateTile(event.startDate);
  const state = liveState(event);
  const full = event.capacity != null && event.goingCount >= event.capacity;
  const place = event.venueName ?? event.address;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/events/[id]", params: { id: event.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${eventWhen(event)}`}
      style={{ opacity: state === "ended" ? 0.8 : 1 }}
    >
      <Bevel className="overflow-hidden rounded-ar-lg" style={{ borderRadius: 22 }}>
        <View style={{ height: 120 }}>
          {event.coverImage ? (
            <Image source={{ uri: event.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <>
              <LinearGradient colors={[c("ar-green", 0.2), c("ar-surface"), c("ar-surface")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Grid />
            </>
          )}
          <LinearGradient colors={[c("ar-surface", 0), c("ar-surface", 0.3), c("ar-surface")]} style={StyleSheet.absoluteFill} />

          <Glass style={{ position: "absolute", left: 10, top: 10, width: 48, borderRadius: 12, alignItems: "center", paddingVertical: 6 }}>
            <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.5px] text-ar-green">{tile.month}</Text>
            <Text className="font-hud text-[20px] font-bold leading-[22px] text-ar-text" style={{ fontVariant: ["tabular-nums"] }}>{tile.day}</Text>
          </Glass>

          <View style={{ position: "absolute", right: 10, top: 10, flexDirection: "row", gap: 6 }}>
            {state === "live" && <TonePill tone="green" label="Live" />}
            {state === "ended" && <TonePill tone="muted" label="Ended" />}
            {event.viewer.going && <TonePill tone="green" label="Going" icon={<Check size={10} strokeWidth={3} color={c("ar-green-hot")} />} />}
          </View>
        </View>

        <View className="-mt-6 px-3.5 pb-3.5">
          <View className="flex-row items-end gap-2">
            <BrandAvatar src={event.brand.imageUrl} style={{ width: 32, height: 32, borderRadius: 10, borderWidth: 2, borderColor: c("ar-surface") }} />
            <Text numberOfLines={1} className="font-hud mb-0.5 flex-1 text-[10.5px] font-semibold uppercase tracking-[1.3px] text-ar-dim">{event.brand.name}</Text>
          </View>
          <Text numberOfLines={2} className="mt-2 text-[15px] font-semibold leading-5 text-ar-text">{event.title}</Text>
          <Text className="font-hud mt-1 text-[11px] font-semibold text-ar-green">{eventWhen(event)}</Text>

          <View className="mt-2.5 flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
              {place ? (
                <>
                  <MapPin size={11} strokeWidth={2.5} color={c("ar-text-faint")} />
                  <Text numberOfLines={1} className="font-hud flex-1 text-[10.5px] font-semibold text-ar-faint">{place}</Text>
                </>
              ) : event.hasLink ? (
                <>
                  <Globe size={11} strokeWidth={2.5} color={c("ar-text-faint")} />
                  <Text className="font-hud text-[10.5px] font-semibold text-ar-faint">Online</Text>
                </>
              ) : null}
            </View>
            <View className="flex-row items-center gap-1">
              <Users size={11} strokeWidth={2.5} color={full ? c("rarity-legendary") : c("ar-text-faint")} />
              <Text className="font-hud text-[10.5px] font-semibold" style={{ color: full ? c("rarity-legendary") : c("ar-text-faint") }}>{spotsLabel(event)}</Text>
            </View>
          </View>
        </View>
      </Bevel>
    </Pressable>
  );
}

export function EventCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-ar-lg border border-ar-line bg-ar-surface">
      <Skeleton className="h-[120px] w-full rounded-none border-0" />
      <View className="px-3.5 pb-3.5 pt-2">
        <Skeleton className="h-2.5 w-1/3 rounded-full" />
        <Skeleton className="mt-3 h-3.5 w-4/5 rounded-full" />
        <Skeleton className="mt-2 h-2.5 w-1/2 rounded-full" />
        <View className="mt-3 flex-row justify-between">
          <Skeleton className="h-2.5 w-24 rounded-full" />
          <Skeleton className="h-2.5 w-16 rounded-full" />
        </View>
      </View>
    </View>
  );
}
