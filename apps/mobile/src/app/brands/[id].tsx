import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { BadgeCheck, Share2 } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Pressable, Share, StyleSheet, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { HoloCard } from "~/components/cards/HoloCard";
import { BackButton } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { CardSkeleton, Skeleton, SkeletonText, StatRowSkeleton } from "~/components/ui/Skeleton";
import { Glass, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useToggleFollow } from "~/lib/api/follow";
import { useBrandPinsQuery, useBrandQuery } from "~/lib/api/queries";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

const compact = (n: number) => (n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));
const PAGE_SIZE = 24;

/** Port of wadzzoAR's /brands/[id]: live drops vs your cards, separately. */
export default function BrandScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: brand, isLoading } = useBrandQuery(id ?? null);
  const follow = useToggleFollow();
  const requireAuth = useSession((s) => s.requireAuth);
  const signedIn = useSession((s) => Boolean(s.user));
  const [tab, setTab] = useState<"live" | "yours">("live");
  const live = useBrandPinsQuery({ brandId: id ?? null, tab: "live", pageSize: PAGE_SIZE });
  const yours = useBrandPinsQuery({ brandId: signedIn ? (id ?? null) : null, tab: "yours", pageSize: PAGE_SIZE });
  const active = tab === "live" ? live : yours;
  const remaining = active.total - active.pins.length;

  if (isLoading) {
    return (
      <View className="flex-1 bg-ar-bg">
        <Skeleton className="h-[188px] w-full rounded-none" />
        <View className="px-5">
          <Skeleton className="-mt-10 h-[76px] w-[76px] rounded-[20px]" />
          <Skeleton className="mt-3 h-5 w-2/3 rounded-full" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-full" />
          <SkeletonText lines={2} className="mt-3.5" />
          <View className="mt-4">
            <StatRowSkeleton count={3} />
          </View>
          <Skeleton className="mt-4 h-10 w-full rounded-full" />
        </View>
      </View>
    );
  }
  if (!brand) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ar-bg px-8">
        <Text className="font-hud text-[15px] font-bold uppercase tracking-[1.8px] text-ar-dim">Brand not found</Text>
        <ArLinkButton href="/brands" variant="primary">
          All brands
        </ArLinkButton>
      </View>
    );
  }

  const header = (
    <View>
      <View style={{ height: 188 }}>
        {brand.coverUrl && <Image source={{ uri: brand.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        <LinearGradient colors={[c("ar-void", 0.7), c("ar-bg", 0), c("ar-bg")]} style={StyleSheet.absoluteFill} />
        <Grid opacity={0.07 * 0.25 * 4} />
        <View style={{ position: "absolute", left: 16, right: 16, top: insets.top + 14, flexDirection: "row", justifyContent: "space-between" }}>
          <BackButton fallback="/brands" />
          <Pressable onPress={() => void Share.share({ title: brand.name, message: brand.tagline ?? brand.bio })} accessibilityLabel="Share this brand">
            <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
              <Share2 size={15} strokeWidth={2.2} color={c("ar-text")} />
            </Glass>
          </Pressable>
        </View>
      </View>

      <View className="-mt-11 px-5">
        <Animated.View entering={ZoomIn.springify().stiffness(320).damping(24)}>
          <BrandAvatar src={brand.avatarUrl} style={{ width: 84, height: 84, borderRadius: 22, borderWidth: 3, borderColor: c("ar-bg") }} />
        </Animated.View>
        <View className="mt-3 flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="shrink text-[21px] font-semibold text-ar-text">{brand.name}</Text>
          {brand.verified && <BadgeCheck size={17} strokeWidth={2.4} color={c("ar-green-hot")} accessibilityLabel="Verified" />}
        </View>
        <Text className="font-hud mt-0.5 text-[11px] uppercase tracking-[1.5px] text-ar-faint">
          @{brand.handle}
          {brand.region ? ` · ${brand.region}` : ""}
        </Text>
        {(brand.tagline ?? brand.bio) ? <Text className="mt-2.5 text-[13px] leading-5 text-ar-dim">{brand.tagline ?? brand.bio}</Text> : null}
      </View>

      <View className="mx-5 mt-4 flex-row items-center justify-around rounded-ar border border-ar-line bg-ar-text/5 py-3">
        <StatBlock label="Followers" value={compact(brand.followers)} />
        <View className="h-8 w-px bg-ar-line" />
        <StatBlock label="Live now" value={live.total} accent />
        <View className="h-8 w-px bg-ar-line" />
        <StatBlock label="You hold" value={yours.total} />
      </View>

      {follow.error && (
        <View className="mx-5 mt-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
          <Text className="text-[12px] leading-5 text-ar-danger">{follow.error}</Text>
        </View>
      )}

      <View className="mt-3 flex-row gap-2 px-5">
        <View className="flex-1">
          <ArButton
            variant={brand.followed ? "outline" : "primary"}
            block
            busy={follow.pendingId === brand.id}
            onPress={() => {
              const go = () => follow.toggle(brand);
              if (!requireAuth("follow", go)) return;
              go();
            }}
          >
            {follow.labelFor(brand)}
          </ArButton>
        </View>
        <ArLinkButton href="/map">On map</ArLinkButton>
      </View>
      {brand.followed && <Text className="mt-2 px-5 text-[11px] leading-5 text-ar-faint">Their private and members-only drops now show on your map.</Text>}

      <View className="mt-6 px-5">
        <Text className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">About</Text>
        <Text className="text-[13px] leading-5 text-ar-dim">{brand.bio}</Text>
      </View>

      <SegmentedTabs
        className="mx-5 mt-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "live", label: "Live drops", count: live.total },
          { id: "yours", label: "Your collectibles", count: yours.total },
        ]}
      />
      <View style={{ height: 16 }} />
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-ar-bg"
      data={active.isLoading ? [] : active.pins}
      keyExtractor={(p) => p.id}
      numColumns={2}
      ListHeaderComponent={header}
      columnWrapperStyle={{ gap: 14, paddingHorizontal: 20 }}
      contentContainerStyle={{ gap: 14, paddingBottom: insets.bottom + 32 }}
      renderItem={({ item }) => (
        <View style={{ flex: 1, maxWidth: "50%" }}>
          <HoloCard pin={item} oneFace onPress={() => router.push(`/collection/${item.id}`)} />
        </View>
      )}
      ListEmptyComponent={
        active.isLoading ? (
          <View className="flex-row flex-wrap gap-3.5 px-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ width: "47.5%" }}>
                <CardSkeleton />
              </View>
            ))}
          </View>
        ) : (
          <View className="items-center py-12">
            <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">{tab === "live" ? "Nothing live right now" : "None yet"}</Text>
            <Text className="mt-1.5 max-w-[17rem] text-center text-[12.5px] leading-5 text-ar-faint">
              {tab === "live" ? `Follow ${brand.name} and you'll see their next drop the moment it lands.` : `Capture one of ${brand.name}'s pins and it'll show up here.`}
            </Text>
          </View>
        )
      }
      ListFooterComponent={
        remaining > 0 ? (
          <View className="mt-3 items-center">
            <ArButton busy={active.isFetchingNextPage} onPress={() => void active.fetchNextPage()}>
              {`Show ${Math.min(remaining, PAGE_SIZE)} more · ${remaining} left`}
            </ArButton>
          </View>
        ) : null
      }
    />
  );
}
