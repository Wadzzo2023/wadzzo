import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Footprints, Gift, Lock, MapPinned, Play, Trophy } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { TrailShape } from "~/components/trails/TrailShape";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useClaimTrailReward, useStartTrail, useTrailQuery } from "~/lib/api/queries";
import { distanceLabel, MODE_VERB, nextStop, trailColor, useFollowTrail } from "~/lib/ar/trails";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

/**
 * ── /trails/[id] ───────────────────────────────────────────────────────────
 *
 * Port of the web app's trail page: its shape, stops, rules and reward, with
 * Start (or Continue) to follow it on the map. Stops are collected the usual
 * way; on an ordered trail each required stop waits for the one before.
 * Finished, the reward is claimed here and lands in the collection.
 */
export default function TrailScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const requireAuth = useSession((s) => s.requireAuth);
  const follow = useFollowTrail((s) => s.follow);
  const followingId = useFollowTrail((s) => s.trailId);
  const detail = useTrailQuery(id);
  const start = useStartTrail();
  const claim = useClaimTrailReward();
  const [error, setError] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState<string | null>(null);

  const t = detail.data;
  if (!t) {
    return (
      <View className="flex-1 bg-ar-bg">
        <ScreenHeader back eyebrow="Trail" title={detail.isLoading ? "Loading…" : "Not found"} />
        <View className="gap-3 px-5">
          {detail.isLoading ? (
            <>
              <Skeleton className="h-[280px] w-full rounded-ar-lg" />
              <Skeleton className="h-14 w-full rounded-ar-lg" />
            </>
          ) : (
            <>
              <Text className="text-[13px] text-ar-dim">This trail has ended or isn&rsquo;t available.</Text>
              <ArLinkButton href="/trails" variant="primary">
                All trails
              </ArLinkButton>
            </>
          )}
        </View>
      </View>
    );
  }

  const color = trailColor(t);
  const { done, total, complete, requiredTotal } = t.progress;
  const next = nextStop(t);
  const onTrail = followingId === t.id;

  const goToMap = () => {
    follow(t.id);
    router.navigate("/map");
  };
  const onStart = () => {
    if (!requireAuth("collect")) return;
    setError(null);
    if (t.run) return goToMap();
    start.mutate(t.id, { onSuccess: goToMap, onError: (e) => setError(e.message) });
  };
  const onClaim = () => {
    setError(null);
    claim.mutate(t.id, {
      onSuccess: (r) => {
        setRedeemCode(r.redeemCode);
        void detail.refetch();
      },
      onError: (e) => setError(e.message),
    });
  };

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader back eyebrow={t.brand.name} title={t.title} />
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        <Bevel className="items-center rounded-ar-lg" style={{ borderRadius: 22 }}>
          <TrailShape trail={t} size={Math.min(width - 40, 360)} numbers />
        </Bevel>

        <Bevel className="mt-4 flex-row justify-around rounded-ar-lg py-3" style={{ borderRadius: 18 }}>
          <StatBlock label="Stops" value={total} />
          <StatBlock label="Distance" value={distanceLabel(t.distanceMetres)} />
          <StatBlock label={`Min ${MODE_VERB[t.mode] ?? ""}`} value={`~${t.estMinutes}`} />
        </Bevel>

        <Pressable onPress={() => router.push(`/brands/${t.brand.id}`)} className="mt-4 flex-row items-center self-start" style={{ gap: 8 }}>
          <BrandAvatar src={t.brand.imageUrl} style={{ width: 28, height: 28, borderRadius: 9 }} />
          <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.5px] text-ar-dim">{t.brand.name}</Text>
        </Pressable>

        {t.description ? <Text className="mt-3 text-[14px] leading-[22px] text-ar-dim">{t.description}</Text> : null}

        <View className="mt-3 flex-row items-center" style={{ gap: 6 }}>
          <Footprints size={12} color={c("ar-text-faint")} />
          <Text className="flex-1 text-[11.5px] text-ar-faint">
            {t.order === "ORDERED" ? "Collect the stops in order: each one unlocks the next." : "Collect the stops in any order."}
            {requiredTotal < total ? " Optional stops are a bonus." : ""}
          </Text>
        </View>

        {t.run && (
          <Bevel className="mt-4 rounded-ar-lg p-3.5" style={{ borderRadius: 18 }}>
            <View className="flex-row items-center justify-between">
              <Text className="font-hud text-[12px] font-bold uppercase tracking-[1.2px] text-ar-text">
                {complete ? "Trail complete" : "Your progress"}
              </Text>
              <Text className="font-hud text-[12px] text-ar-dim">
                {done}/{total}
              </Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: c("ar-text", 0.1) }}>
              <View className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }} />
            </View>
          </Bevel>
        )}

        {t.reward && (
          <Bevel className="mt-4 flex-row items-center rounded-ar-lg p-3.5" style={{ borderRadius: 18, gap: 12 }}>
            {t.reward.thumbnail ? (
              <Image source={{ uri: t.reward.thumbnail }} style={{ width: 44, height: 44, borderRadius: 10 }} contentFit="cover" />
            ) : (
              <Gift size={22} color={c("ar-green-hot")} />
            )}
            <View className="min-w-0 flex-1">
              <Text className="text-[10.5px] uppercase tracking-[1.2px] text-ar-faint">Finishing reward</Text>
              <Text className="text-[13.5px] font-semibold text-ar-text" numberOfLines={1}>
                {t.reward.name}
              </Text>
              <Text className="text-[11.5px] text-ar-dim">
                {t.reward.claimed ? "Claimed: it's in your collection" : t.reward.remaining > 0 ? `${t.reward.remaining} left` : "All claimed"}
              </Text>
            </View>
            {complete && !t.reward.claimed && t.reward.remaining > 0 && (
              <ArButton size="sm" variant="primary" icon={Trophy} busy={claim.isPending} onPress={onClaim}>
                Claim
              </ArButton>
            )}
          </Bevel>
        )}
        {redeemCode && (
          <Bevel className="mt-3 items-center rounded-ar-lg p-3" style={{ borderRadius: 18 }}>
            <Text className="text-[10.5px] uppercase tracking-[1.2px] text-ar-faint">Redeem code</Text>
            <Text selectable className="font-hud mt-1 text-[17px] font-bold tracking-[2.4px] text-ar-text">
              {redeemCode}
            </Text>
          </Bevel>
        )}

        {error && <Text className="mt-3 text-[12px] text-ar-danger">{error}</Text>}

        {!complete && (
          <ArButton block size="lg" variant="primary" icon={t.run ? MapPinned : Play} className="mt-5" busy={start.isPending} onPress={onStart}>
            {t.run ? (onTrail ? "Back to the map" : "Continue on the map") : "Start trail"}
          </ArButton>
        )}

        <Text className="font-hud mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[2.8px] text-ar-faint">Stops</Text>
        <View style={{ gap: 8 }}>
          {t.stops.map((s) => {
            const isNext = next?.position === s.position && !complete;
            const dim = (Boolean(s.lockReason) || s.unavailable) && !s.done;
            return (
              <View
                key={s.position}
                className="flex-row items-center rounded-ar border p-2.5"
                style={{
                  gap: 12,
                  opacity: dim ? 0.6 : 1,
                  borderColor: isNext ? c("ar-green", 0.5) : c("ar-line"),
                  backgroundColor: c("ar-text", 0.03),
                }}
              >
                <View
                  className="items-center justify-center rounded-full"
                  style={{ width: 28, height: 28, backgroundColor: s.required ? color : c("ar-text", 0.2) }}
                >
                  {s.done ? (
                    <Check size={14} strokeWidth={3} color="#ffffff" />
                  ) : (
                    <Text className="font-hud text-[12px] font-bold" style={{ color: "#ffffff" }}>
                      {s.position}
                    </Text>
                  )}
                </View>
                <Image source={{ uri: s.imageUrl }} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="cover" />
                <View className="min-w-0 flex-1">
                  <Text className="text-[13px] font-semibold text-ar-text" numberOfLines={1}>
                    {s.title}
                  </Text>
                  <Text className="text-[11.5px] text-ar-dim" numberOfLines={1}>
                    {s.done
                      ? "Collected"
                      : s.unavailable
                        ? "No longer available"
                        : (s.lockReason ?? s.clue ?? (s.required ? "Next up" : "Optional bonus stop"))}
                  </Text>
                </View>
                {s.lockReason && !s.done && <Lock size={14} color={c("ar-text-faint")} />}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
