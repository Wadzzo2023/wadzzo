import { Image } from "expo-image";
import { router } from "expo-router";
import { BadgeCheck, MapPin, Search, Users, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { useTabBarHeight } from "~/components/shell/BottomTabBar";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton } from "~/components/ui/ArButton";
import { SegmentedTabs } from "~/components/ui/SegmentedTabs";
import { BrandRowSkeleton } from "~/components/ui/Skeleton";
import { Bevel } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useToggleFollow } from "~/lib/api/follow";
import { useBrandsQuery } from "~/lib/api/queries";
import type { ArBrand } from "~/lib/ar/types";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

const compact = (n: number) => (n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

/**
 * Port of wadzzoAR's /brands. Browsable signed out — Follow is the only
 * thing behind the gate, and it's the loudest thing on each row because
 * following is what puts a brand's private drops on your map.
 */
export default function BrandsScreen() {
  const tabBarHeight = useTabBarHeight();
  const { c } = useColors();
  const { brands, isLoading } = useBrandsQuery();
  const follow = useToggleFollow();
  const requireAuth = useSession((s) => s.requireAuth);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "following">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return brands.filter((b) => {
      if (tab === "following" && !b.followed) return false;
      if (!q) return true;
      return b.name.toLowerCase().includes(q) || b.handle.toLowerCase().includes(q) || (b.tagline ?? b.bio).toLowerCase().includes(q) || b.categories.some((cat) => cat.toLowerCase().includes(q));
    });
  }, [brands, query, tab]);

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader eyebrow="Who's dropping" title="Brands" />
      <View className="px-5">
        <Bevel className="h-11 flex-row items-center gap-2.5 rounded-ar px-3.5" style={{ borderRadius: 16 }}>
          <Search size={15} strokeWidth={2.2} color={c("ar-text-faint")} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search brands" placeholderTextColor={c("ar-text-faint")} accessibilityLabel="Search brands" className="flex-1 text-[13px] text-ar-text" style={{ fontFamily: "Sora_400Regular" }} />
          {query ? (
            <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
              <X size={15} strokeWidth={2.4} color={c("ar-text-faint")} />
            </Pressable>
          ) : null}
        </Bevel>
      </View>
      <SegmentedTabs
        className="mx-5 mt-3"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "all", label: "All", count: brands.length },
          { id: "following", label: "Following", count: brands.filter((b) => b.followed).length, icon: Users },
        ]}
      />
      {follow.error && (
        <View className="mx-5 mt-3 rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5">
          <Text className="text-[12px] leading-5 text-ar-danger">{follow.error}</Text>
        </View>
      )}
      <FlatList
        data={isLoading ? [] : shown}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: tabBarHeight + 32 }}
        renderItem={({ item }) => (
          <BrandRow
            brand={item}
            busy={follow.pendingId === item.id}
            label={follow.labelFor(item)}
            onToggle={() => {
              const go = () => follow.toggle(item);
              if (!requireAuth("follow", go)) return;
              go();
            }}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View className="gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <BrandRowSkeleton key={i} />
              ))}
            </View>
          ) : (
            <View className="items-center py-16">
              <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">No brands here</Text>
              <Text className="mt-1.5 max-w-[16rem] text-center text-[12.5px] leading-5 text-ar-faint">
                {tab === "following" ? "Follow a brand and their private drops start showing up on your map." : "Nothing matches that search."}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function BrandRow({ brand, onToggle, busy, label }: { brand: ArBrand; onToggle: () => void; busy: boolean; label: string }) {
  const { c } = useColors();
  return (
    <Bevel className="overflow-hidden rounded-ar" style={{ borderRadius: 16 }}>
      {brand.coverUrl && <Image source={{ uri: brand.coverUrl }} style={{ position: "absolute", inset: 0, opacity: 0.14 }} contentFit="cover" />}
      <View className="flex-row items-center gap-3 p-3">
        <Pressable onPress={() => router.push(`/brands/${brand.id}`)}>
          <BrandAvatar src={brand.avatarUrl} style={{ width: 52, height: 52, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }} />
        </Pressable>
        <Pressable onPress={() => router.push(`/brands/${brand.id}`)} className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1">
            <Text numberOfLines={1} className="shrink text-[14px] font-semibold text-ar-text">{brand.name}</Text>
            {brand.verified && <BadgeCheck size={14} strokeWidth={2.4} color={c("ar-green-hot")} accessibilityLabel="Verified" />}
          </View>
          {(brand.tagline ?? brand.bio) ? <Text numberOfLines={1} className="mt-0.5 text-[11.5px] text-ar-faint">{brand.tagline ?? brand.bio}</Text> : null}
          <View className="mt-1.5 flex-row items-center gap-3">
            <View className="flex-row items-center gap-1">
              <Users size={10} strokeWidth={2.6} color={c("ar-text-dim")} />
              <Text className="font-hud text-[10px] font-semibold text-ar-dim">{compact(brand.followers)}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <MapPin size={10} strokeWidth={2.6} color={c("ar-text-dim")} />
              <Text className="font-hud text-[10px] font-semibold text-ar-dim">{brand.pinCount} live</Text>
            </View>
            {brand.region && <Text numberOfLines={1} className="font-hud text-[10px] text-ar-faint">{brand.region}</Text>}
          </View>
        </Pressable>
        <ArButton size="sm" variant={brand.followed ? "outline" : "primary"} busy={busy} onPress={onToggle} style={{ minWidth: 92 }}>
          {label}
        </ArButton>
      </View>
    </Bevel>
  );
}
