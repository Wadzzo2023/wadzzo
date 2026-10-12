import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Clock, Trophy, Users } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { TonePill } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { BountyCard as BountyCardData } from "~/lib/api/types";
import { deadlineLabel, formatAmount, formatUsd, viewerBadge } from "~/lib/ar/bounty";
import { useColors } from "~/theme/theme";

/** Port of the web BountyCard: who, what it pays, room left, time left, you. */
export function BountyCard({ bounty }: { bounty: BountyCardData }) {
  const { c } = useColors();
  const badge = viewerBadge(bounty);
  const deadline = deadlineLabel(bounty.endDate);
  return (
    <Pressable onPress={() => router.push(`/bounty/${bounty.id}`)} accessibilityRole="button" accessibilityLabel={`${bounty.title}, ${formatUsd(bounty.rewardUsd)} per winner`}>
      <Bevel className="overflow-hidden rounded-ar-lg" style={{ borderRadius: 22 }}>
        <View style={{ height: 112 }}>
          {bounty.imageUrl ? (
            <Image source={{ uri: bounty.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <>
              <LinearGradient colors={[c("ar-green", 0.2), c("ar-surface"), c("ar-surface")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Grid />
            </>
          )}
          <LinearGradient colors={[c("ar-surface", 0), c("ar-surface", 0.3), c("ar-surface")]} style={StyleSheet.absoluteFill} />
          <View style={{ position: "absolute", right: 10, top: 10 }}>
            <TonePill tone={badge.tone} label={badge.label} />
          </View>
        </View>
        <View className="-mt-7 px-3.5 pb-3.5">
          <View className="flex-row items-end gap-2">
            <BrandAvatar src={bounty.brand.avatarUrl} style={{ width: 36, height: 36, borderRadius: 11, borderWidth: 2, borderColor: c("ar-surface") }} />
            <Text numberOfLines={1} className="font-hud mb-0.5 flex-1 text-[10.5px] font-semibold uppercase tracking-[1.3px] text-ar-dim">{bounty.brand.name}</Text>
          </View>
          <Text numberOfLines={2} className="mt-2 text-[15px] font-semibold leading-5 text-ar-text">{bounty.title}</Text>
          <View className="mt-2.5 flex-row items-end justify-between gap-3">
            <View>
              <Text className="font-hud text-[20px] font-bold text-ar-green-hot" style={{ fontVariant: ["tabular-nums"] }}>{formatUsd(bounty.rewardUsd)}</Text>
              <Text className="font-hud mt-1 text-[10px] font-semibold text-ar-faint">
                {formatAmount(bounty.rewardAsset)} {bounty.assetCode} per winner
              </Text>
            </View>
            <View className="items-end gap-1">
              <View className="flex-row items-center gap-1">
                <Trophy size={10} strokeWidth={2.6} color={c("ar-text-dim")} />
                <Text className="font-hud text-[10px] font-semibold text-ar-dim">
                  {bounty.open ? `${bounty.spotsLeft} of ${bounty.totalWinners} spots left` : `${bounty.totalWinners} winner${bounty.totalWinners === 1 ? "" : "s"}`}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                <View className="flex-row items-center gap-1">
                  <Users size={10} strokeWidth={2.6} color={c("ar-text-dim")} />
                  <Text className="font-hud text-[10px] font-semibold text-ar-dim">{bounty.participants}</Text>
                </View>
                {deadline && (
                  <View className="flex-row items-center gap-1">
                    <Clock size={10} strokeWidth={2.6} color={deadline.urgent ? c("rarity-legendary") : c("ar-text-dim")} />
                    <Text className="font-hud text-[10px] font-semibold" style={{ color: deadline.urgent ? c("rarity-legendary") : c("ar-text-dim") }}>{deadline.text}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      </Bevel>
    </Pressable>
  );
}

export function BountyCardSkeleton() {
  return (
    <View className="overflow-hidden rounded-ar-lg border border-ar-line bg-ar-surface">
      <Skeleton className="h-[112px] w-full rounded-none border-0" />
      <View className="px-3.5 pb-3.5 pt-2">
        <Skeleton className="h-2.5 w-1/3 rounded-full" />
        <Skeleton className="mt-3 h-3.5 w-4/5 rounded-full" />
        <View className="mt-3 flex-row items-end justify-between">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-2.5 w-24 rounded-full" />
        </View>
      </View>
    </View>
  );
}
