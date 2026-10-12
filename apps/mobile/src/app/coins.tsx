import { router } from "expo-router";
import { Coins, Frame, Gift, ShieldX, Sparkles, Undo2, type LucideIcon } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { useSession } from "~/lib/auth/session";
import { useCoinBalance, useCoinHistory, type CoinRow } from "~/lib/murals/api";
import { useColors } from "~/theme/theme";

/**
 * ── /coins ─────────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's Wadzzo Coins screen: balance, "Redeem coming soon",
 * and every change to the balance. Read-only.
 */

const REASON: Record<CoinRow["reason"], { label: string; icon: LucideIcon }> = {
  MURAL_SCAN: { label: "Mural scan", icon: Frame },
  MURAL_DISCOVERY: { label: "Discovery bonus", icon: Sparkles },
  MURAL_REVOKE: { label: "Taken back — rejected as fraud", icon: ShieldX },
  ADMIN_ADJUST: { label: "Adjustment", icon: Undo2 },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function CoinsScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const signedIn = useSession((s) => Boolean(s.user));
  const requireAuth = useSession((s) => s.requireAuth);
  const balance = useCoinBalance(signedIn);
  const history = useCoinHistory(signedIn);
  // Zero-amount rows only annotate a revoke the balance couldn't cover.
  const rows = (history.data?.pages.flatMap((p) => p.items) ?? []).filter((r) => r.amount !== 0);
  const gold = c("rarity-legendary");

  const header = (
    <View>
      <ScreenHeader back eyebrow="Wallet" title="Wadzzo Coins" />
      {signedIn && (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ alignItems: "center", borderRadius: 22, borderWidth: 1, borderColor: c("rarity-legendary", 0.4), backgroundColor: c("rarity-legendary", 0.1), paddingVertical: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Coins size={30} strokeWidth={2.3} color={gold} />
              <Text className="font-hud text-[38px] font-bold" style={{ color: gold }}>
                {balance.isLoading ? "—" : (balance.data?.balance ?? 0).toLocaleString()}
              </Text>
            </View>
            <Text className="mt-2 text-[11px] uppercase tracking-[1.6px] text-ar-faint">Your balance</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: c("ar-line"), paddingHorizontal: 16, paddingVertical: 12 }}>
            <Gift size={18} strokeWidth={2.2} color={c("ar-text-dim")} />
            <Text className="flex-1 text-[12px] leading-[18px] text-ar-dim">
              <Text className="font-semibold text-ar-text">Redeem coming soon.</Text> Keep collecting — every coin you earn now will count.
            </Text>
          </View>
          <Text className="font-hud mt-2 text-[11px] font-bold uppercase tracking-[1.6px] text-ar-dim">History</Text>
        </View>
      )}
    </View>
  );

  if (!signedIn) {
    return (
      <View style={{ flex: 1 }} className="bg-ar-bg">
        {header}
        <View style={{ alignItems: "center", paddingTop: 32 }}>
          <Coins size={30} strokeWidth={1.8} color={gold} />
          <Text className="font-hud mt-3 text-[15px] font-bold text-ar-text">Sign in to see your coins</Text>
          <View style={{ marginTop: 16 }}>
            <ArButton variant="primary" onPress={() => requireAuth("murals")}>
              Sign in
            </ArButton>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }} className="bg-ar-bg">
      <FlatList<CoinRow>
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        onEndReached={() => history.hasNextPage && !history.isFetchingNextPage && void history.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          history.isLoading ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} style={{ height: 56, borderRadius: 14 }} />
              ))}
            </View>
          ) : (
            <View style={{ marginHorizontal: 20, marginTop: 8, alignItems: "center", borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: c("ar-line"), paddingVertical: 28 }}>
              <Text className="text-[12.5px] text-ar-dim">No coins yet. Scan a mural to earn your first.</Text>
              <View style={{ marginTop: 14 }}>
                <ArLinkButton href="/murals" variant="primary">
                  Open the Murals camera
                </ArLinkButton>
              </View>
            </View>
          )
        }
        renderItem={({ item: r, index }) => {
          const meta = REASON[r.reason] ?? REASON.ADMIN_ADJUST;
          const Icon = meta.icon;
          const plus = r.amount > 0;
          const tone = plus ? gold : c("ar-danger");
          return (
            <Pressable
              disabled={!r.mural}
              onPress={() => r.mural && router.push(`/murals/${r.mural.id}`)}
              style={{ marginHorizontal: 20, marginTop: index === 0 ? 8 : 0, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: c("ar-line") }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: plus ? c("rarity-legendary", 0.4) : c("ar-danger", 0.4), alignItems: "center", justifyContent: "center" }}>
                <Icon size={15} strokeWidth={2.3} color={tone} />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-[12.5px] text-ar-text" numberOfLines={1}>
                  {r.mural?.title ?? meta.label}
                </Text>
                <Text className="text-[10.5px] text-ar-faint" numberOfLines={1}>
                  {meta.label} · {when(r.createdAt)}
                </Text>
              </View>
              <Text className="font-hud text-[14px] font-bold" style={{ color: tone }}>
                {plus ? "+" : "−"}
                {Math.abs(r.amount).toLocaleString()}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
