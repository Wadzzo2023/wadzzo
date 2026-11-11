import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Check, Footprints, Gift, MapPin, Users } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { ArTrail } from "~/lib/api/types";
import { distanceMeters } from "~/lib/ar/geo";
import { distanceLabel, MODE_VERB, routeMapImage, trailColor } from "~/lib/ar/trails";
import { useColors, useResolvedTheme } from "~/theme/theme";

import { TrailShape } from "./TrailShape";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const BANNER_H = 132;

/**
 * Port of the web's TrailCard, built like the EventCard: a banner (the brand's cover, or the
 * route on a map), the brand, the title, then what it takes (stops, length, time) and how far
 * the start is. Started trails show how far along you are.
 */
export function TrailCard({ trail: t, fix }: { trail: ArTrail; fix?: { lat: number; lng: number } | null }) {
  const { c } = useColors();
  const theme = useResolvedTheme();
  const color = trailColor(t);
  const { done, total, complete } = t.progress;
  const start = t.stops[0];
  const away = fix && start ? distanceMeters(fix, start) : null;
  // A cover or map that fails to load falls back to the drawn outline.
  const [broken, setBroken] = useState(false);
  const banner = broken ? null : (t.coverImage ?? (MAPBOX_TOKEN ? routeMapImage(t, MAPBOX_TOKEN, theme) : null));

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/trails/[id]", params: { id: t.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${t.title}, ${total} stops`}
    >
      <Bevel className="overflow-hidden rounded-ar-lg" style={{ borderRadius: 22, overflow: "hidden" }}>
        <View style={{ height: BANNER_H, overflow: "hidden" }}>
          {banner ? (
            <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} onError={() => setBroken(true)} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
              <Grid />
              <TrailShape trail={t} size={BANNER_H - 8} />
            </View>
          )}
          <LinearGradient
            colors={[c("ar-surface"), c("ar-surface", 0.2), "transparent"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View className="absolute flex-row" style={{ top: 10, right: 10, gap: 6 }}>
            {complete ? (
              <Badge border={c("ar-green", 0.6)} bg={c("ar-green", 0.2)}>
                <Check size={10} strokeWidth={3} color={c("ar-green-hot")} />
                <BadgeText color={c("ar-green-hot")}>Finished</BadgeText>
              </Badge>
            ) : t.run ? (
              <Badge border={c("ar-green", 0.6)} bg={c("ar-green", 0.15)}>
                <BadgeText color={c("ar-green-hot")}>{`${done}/${total} done`}</BadgeText>
              </Badge>
            ) : null}
            {t.reward && !t.reward.claimed && t.reward.remaining > 0 && (
              <Badge border={c("ar-line")} bg={c("ar-surface", 0.8)}>
                <Gift size={10} color={c("ar-green-hot")} />
                <BadgeText color={c("ar-text")}>Reward</BadgeText>
              </Badge>
            )}
          </View>
        </View>

        <View className="px-3.5 pb-3.5" style={{ marginTop: -24 }}>
          <View className="flex-row items-end" style={{ gap: 8 }}>
            <BrandAvatar src={t.brand.imageUrl} style={{ width: 32, height: 32, borderRadius: 10, borderWidth: 2, borderColor: c("ar-surface") }} />
            <Text className="font-hud mb-0.5 flex-1 text-[10.5px] font-semibold uppercase tracking-[1.3px] text-ar-dim" numberOfLines={1}>
              {t.brand.name}
            </Text>
          </View>

          <Text className="mt-2 text-[15px] font-semibold leading-snug text-ar-text" numberOfLines={2}>
            {t.title}
          </Text>
          <Text className="font-hud mt-1 text-[11px] font-semibold" style={{ color, fontVariant: ["tabular-nums"] }}>
            {total} stops · {distanceLabel(t.distanceMetres)} · ~{t.estMinutes} min {MODE_VERB[t.mode] ?? ""}
          </Text>

          {t.run && !complete && (
            <View className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: c("ar-text", 0.1) }}>
              <View className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }} />
            </View>
          )}

          <View className="mt-2.5 flex-row items-center justify-between" style={{ gap: 12 }}>
            <View className="min-w-0 flex-1 flex-row items-center" style={{ gap: 4 }}>
              {away !== null ? <MapPin size={11} color={c("ar-text-faint")} /> : <Footprints size={11} color={c("ar-text-faint")} />}
              <Text className="font-hud shrink text-[10.5px] font-semibold text-ar-faint" numberOfLines={1}>
                {away !== null ? `Starts ${distanceLabel(away)} away` : t.order === "ORDERED" ? "In order" : "Any order"}
              </Text>
            </View>
            {t.runners > 0 && (
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Users size={11} color={c("ar-text-faint")} />
                <Text className="font-hud text-[10.5px] font-semibold text-ar-faint">{t.runners} on it</Text>
              </View>
            )}
          </View>
        </View>
      </Bevel>
    </Pressable>
  );
}

export function TrailCardSkeleton() {
  return (
    <Bevel className="overflow-hidden rounded-ar-lg" style={{ borderRadius: 22, overflow: "hidden" }}>
      <Skeleton className="w-full rounded-none" style={{ height: BANNER_H }} />
      <View className="gap-2 px-3.5 pb-3.5 pt-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </View>
    </Bevel>
  );
}

function Badge({ children, border, bg }: { children: ReactNode; border: string; bg: string }) {
  return (
    <View className="flex-row items-center rounded-full border px-2 py-0.5" style={{ gap: 4, borderColor: border, backgroundColor: bg }}>
      {children}
    </View>
  );
}

function BadgeText({ children, color }: { children: ReactNode; color: string }) {
  return (
    <Text className="font-hud text-[9.5px] font-bold uppercase tracking-[1.1px]" style={{ color }}>
      {children}
    </Text>
  );
}
