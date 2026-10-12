import { Image } from "expo-image";
import { router } from "expo-router";
import { ChevronRight, Coins, Frame, ScanLine, Sparkles } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";

import { useTabBarHeight } from "~/components/shell/BottomTabBar";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { CardSkeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { useSession } from "~/lib/auth/session";
import { useCoinBalance, useMyMurals, type MyMural } from "~/lib/murals/api";
import { useColors } from "~/theme/theme";

/**
 * ── Collection › Murals ────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's MuralCollection: the Wadzzo Coins card on top, then
 * every mural the viewer scanned as *their own* photo. "Not a mural"
 * rejections stay, greyed; fraud rejections never come back from the server.
 */
export function MuralCollection({ header }: { header: React.ReactElement }) {
  const { c } = useColors();
  const tabBarHeight = useTabBarHeight();
  const signedIn = useSession((s) => Boolean(s.user));
  const requireAuth = useSession((s) => s.requireAuth);
  const balance = useCoinBalance(signedIn);
  const mine = useMyMurals(signedIn);
  const items = mine.data?.pages.flatMap((p) => p.items) ?? [];
  const total = mine.data?.pages[0]?.total ?? 0;
  const gold = c("rarity-legendary");

  const top = (
    <View>
      {header}
      {signedIn && (
        <View style={{ paddingHorizontal: 20 }}>
          <Pressable onPress={() => router.push("/coins")} accessibilityRole="button" accessibilityLabel="Wadzzo Coins">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: c("rarity-legendary", 0.35), backgroundColor: c("rarity-legendary", 0.1), paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c("rarity-legendary", 0.5), alignItems: "center", justifyContent: "center" }}>
                <Coins size={19} strokeWidth={2.3} color={gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="font-hud text-[20px] font-bold" style={{ color: gold }}>
                  {balance.isLoading ? "—" : (balance.data?.balance ?? 0).toLocaleString()}
                </Text>
                <Text className="mt-0.5 text-[10px] uppercase tracking-[1.4px] text-ar-faint">Wadzzo Coins · redeem coming soon</Text>
              </View>
              <ChevronRight size={17} strokeWidth={2.3} color={c("ar-text-faint")} />
            </View>
          </Pressable>
          <View style={{ marginTop: 18, marginBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text className="font-hud text-[11px] font-bold uppercase tracking-[1.6px] text-ar-dim">{total > 0 ? `${total} mural${total === 1 ? "" : "s"}` : "Murals"}</Text>
            <Pressable onPress={() => router.push("/murals")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ScanLine size={12} strokeWidth={2.6} color={c("rarity-epic")} />
              <Text className="font-hud text-[11px] font-bold uppercase tracking-[1.4px] text-rarity-epic">Scan</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  const empty = !signedIn ? (
    <View style={{ alignItems: "center", paddingHorizontal: 32, paddingTop: 24 }}>
      <Frame size={30} strokeWidth={1.7} color={c("rarity-epic")} />
      <Text className="font-hud mt-3 text-[15px] font-bold text-ar-text">Murals you find live here</Text>
      <Text className="mt-1.5 text-center text-[12px] leading-[18px] text-ar-dim">Scan street art with the camera to collect it and earn Wadzzo Coins.</Text>
      <View style={{ marginTop: 16 }}>
        <ArButton variant="primary" onPress={() => requireAuth("murals")}>
          Sign in
        </ArButton>
      </View>
    </View>
  ) : mine.isLoading ? (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, paddingHorizontal: 20 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={{ width: "47.5%" }}>
          <CardSkeleton />
        </View>
      ))}
    </View>
  ) : (
    <View style={{ marginHorizontal: 20, alignItems: "center", borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c("ar-line"), paddingHorizontal: 24, paddingVertical: 32 }}>
      <Frame size={28} strokeWidth={1.7} color={c("rarity-epic")} />
      <Text className="font-hud mt-3 text-[14px] font-bold text-ar-text">No murals yet</Text>
      <Text className="mt-1.5 text-center text-[12px] leading-[18px] text-ar-dim">Point the camera at a mural or graffiti and turn a little left and right. The first finders get a bonus.</Text>
      <View style={{ marginTop: 16 }}>
        <ArLinkButton href="/murals" variant="primary" icon={ScanLine}>
          Open the Murals camera
        </ArLinkButton>
      </View>
    </View>
  );

  return (
    <FlatList<MyMural>
      data={items}
      keyExtractor={(m) => m.id}
      numColumns={2}
      ListHeaderComponent={top}
      ListEmptyComponent={empty}
      columnWrapperStyle={{ gap: 14, paddingHorizontal: 20 }}
      contentContainerStyle={{ gap: 14, paddingBottom: tabBarHeight + 40 }}
      onEndReached={() => mine.hasNextPage && !mine.isFetchingNextPage && void mine.fetchNextPage()}
      onEndReachedThreshold={0.5}
      renderItem={({ item: m }) => {
        const dead = m.status === "REJECTED";
        return (
          <Pressable onPress={() => router.push(`/murals/${m.id}`)} style={{ flex: 1, maxWidth: "50%", opacity: dead ? 0.55 : 1 }}>
            <View style={{ aspectRatio: 4 / 5, borderRadius: 14, borderWidth: 2, borderColor: c("rarity-epic", 0.7), overflow: "hidden", backgroundColor: c("ar-surface") }}>
              <Image source={{ uri: m.myPhotoUrl }} style={{ flex: 1 }} contentFit="cover" recyclingKey={m.id} />
              {m.rank != null && (
                <View style={{ position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, backgroundColor: "rgba(10,18,14,0.8)", paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Sparkles size={9} strokeWidth={2.8} color={c("rarity-epic")} />
                  <Text className="font-hud text-[9px] font-bold uppercase tracking-[1.2px] text-rarity-epic">{m.rank === 1 ? "Discoverer" : `Finder #${m.rank}`}</Text>
                </View>
              )}
              <View style={{ position: "absolute", bottom: 6, right: 6, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, backgroundColor: "rgba(10,18,14,0.8)", paddingHorizontal: 6, paddingVertical: 2 }}>
                <Coins size={10} strokeWidth={2.6} color={gold} />
                <Text className="font-hud text-[10px] font-bold" style={{ color: gold }}>
                  {m.coinsEarned}
                </Text>
              </View>
            </View>
            <Text className="mt-1.5 text-[12.5px] font-semibold text-ar-text" numberOfLines={1}>
              {m.title}
            </Text>
            <Text className="text-[10.5px] text-ar-faint" numberOfLines={1}>
              {dead ? "Not collectable" : m.status === "APPROVED" ? "Verified" : "Unverified"} · {m.myScans} scan{m.myScans === 1 ? "" : "s"}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}
