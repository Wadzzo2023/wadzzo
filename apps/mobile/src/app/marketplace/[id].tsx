import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Lock, Repeat2, ShoppingBag } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { MarketCard, TOKEN_CODE } from "~/components/market/MarketCard";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton } from "~/components/ui/ArButton";
import { StatBlock } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useMarketItem, useMarketRelated } from "~/lib/api/queries";
import type { MarketListing } from "~/lib/api/types";
import { formatPrice, formatUsd, MEDIA, openMarketplace } from "~/lib/market";
import { useColors } from "~/theme/theme";

/**
 * ── /marketplace/[id] ──────────────────────────────────────────────────────
 *
 * Port of the AR web app's item page: the art, who made it, the price and the edition, the
 * description, fan resales and more from the creator. `?listing=<id>` shows one fan resale
 * instead of the creator's own listing. The main button opens the same listing in the
 * marketplace, where buying happens.
 */
export default function MarketItemScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; listing?: string }>();
  const id = Number(params.id);
  const wanted = Number(params.listing);

  const item = useMarketItem(id);
  const related = useMarketRelated(id, Boolean(item.data));

  if (!Number.isInteger(id) || item.isError)
    return (
      <View className="flex-1 bg-ar-bg">
        <ScreenHeader back title="Item" />
        <View className="items-center px-5 py-16">
          <Text className="font-hud text-[13px] font-bold uppercase tracking-[1.8px] text-ar-dim">Item not found</Text>
          <Text className="mt-1.5 max-w-[16rem] text-center text-[12.5px] leading-5 text-ar-faint">It may have sold out or been taken off the marketplace.</Text>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/marketplace"))} className="mt-4">
            <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.5px] text-ar-green">← Back to the marketplace</Text>
          </Pressable>
        </View>
      </View>
    );

  const data = item.data;
  const resale = data && Number.isInteger(wanted) ? (data.resales.find((r) => r.id === wanted) ?? null) : null;
  const listing = resale ?? data?.original ?? data?.resales[0] ?? null;
  const left = data?.limit == null ? null : Math.max(0, data.limit - data.mintedCount);
  const media = data ? MEDIA[data.mediaType] : null;
  const usd = formatUsd(listing?.priceUSD);
  const resales = related.data?.resales.filter((r) => r.id !== resale?.id) ?? [];

  return (
    <View className="flex-1 bg-ar-bg">
      <ScreenHeader back eyebrow="Marketplace" title={data?.name ?? "Loading…"} />
      <ScrollView contentContainerStyle={{ gap: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}>
        {/* ── Art ── */}
        {!data ? (
          <Skeleton style={{ aspectRatio: 1, borderRadius: 22 }} />
        ) : (
          <Bevel className="overflow-hidden" style={{ borderRadius: 22 }}>
            <Image source={{ uri: data.thumbnail }} style={{ width: "100%", aspectRatio: 1 }} contentFit="cover" transition={150} accessibilityLabel={data.name} />
            <View className="absolute left-3 top-3 flex-row flex-wrap gap-1.5">
              {media && (
                <Glass className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ borderRadius: 999 }}>
                  <media.icon size={11} strokeWidth={2.6} color={c("ar-text")} />
                  <Text className="font-hud text-[9.5px] font-bold uppercase tracking-[1.1px] text-ar-text">{media.label}</Text>
                </Glass>
              )}
              {resale && (
                <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: c("rarity-epic", 0.9) }}>
                  <Repeat2 size={11} strokeWidth={2.8} color="#fff" />
                  <Text className="font-hud text-[9.5px] font-bold uppercase tracking-[1.1px]" style={{ color: "#fff" }}>
                    Fan resale
                  </Text>
                </View>
              )}
              {(data.privacy === "TIER" || data.privacy === "PRIVATE") && !resale && (
                <Glass className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ borderRadius: 999 }}>
                  <Lock size={11} strokeWidth={2.6} color={c("ar-text")} />
                  <Text className="font-hud text-[9.5px] font-bold uppercase tracking-[1.1px] text-ar-text">
                    {data.privacy === "TIER" ? `${data.tier?.name ?? "Tier"} members` : "Followers only"}
                  </Text>
                </Glass>
              )}
            </View>
          </Bevel>
        )}

        {/* ── Creator ── */}
        {data && (
          <View className="flex-row items-center gap-3">
            <BrandAvatar src={data.creator?.profileUrl ?? null} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" }} />
            <View className="min-w-0 flex-1">
              <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.7px] text-ar-faint">
                {resale ? `Resale by ${resale.placer?.name ?? "a fan"}` : "Created by"}
              </Text>
              <Text numberOfLines={1} className="text-[15px] font-semibold text-ar-text">
                {data.creator?.name ?? "Wadzzo"}
              </Text>
            </View>
          </View>
        )}

        {/* ── Price + buy ── */}
        {data && (
          <Bevel className="gap-3 p-4" style={{ borderRadius: 16 }}>
            {listing ? (
              <View className="flex-row items-end justify-between gap-3">
                <View>
                  <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.7px] text-ar-faint">{resale ? "Resale price" : "Price"}</Text>
                  <View className="mt-1 flex-row items-baseline gap-1.5">
                    <Text className="font-hud text-[30px] font-bold text-ar-green-hot">{formatPrice(listing.price)}</Text>
                    <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.1px] text-ar-dim">{TOKEN_CODE}</Text>
                  </View>
                </View>
                {usd && <Text className="text-[12px] text-ar-dim">{usd}</Text>}
              </View>
            ) : (
              <Text className="text-[13px] text-ar-dim">Not listed for sale right now.</Text>
            )}
            <ArButton variant="primary" size="lg" block icon={ShoppingBag} onPress={() => openMarketplace(data.id, resale ? resale.id : null)}>
              Go to Marketplace
            </ArButton>
            <Text className="text-center text-[11px] leading-4 text-ar-faint">Buying, wallets and resales happen in the Wadzzo marketplace.</Text>
          </Bevel>
        )}

        {/* ── Edition ── */}
        {data && (
          <Bevel className="flex-row items-center justify-around py-3" style={{ borderRadius: 16 }}>
            <StatBlock label="Edition" value={data.limit == null ? "Open" : data.limit.toLocaleString("en-US")} />
            <StatBlock label="Minted" value={data.mintedCount.toLocaleString("en-US")} />
            {left != null && <StatBlock label="Left" value={String(left)} accent={left > 0} />}
            <StatBlock label="Royalty" value={`${data.royaltyPercent}%`} />
          </Bevel>
        )}

        {/* ── About ── */}
        {data && (
          <View>
            <Text className="font-hud mb-1.5 text-[10px] font-semibold uppercase tracking-[2.4px] text-ar-dim">About</Text>
            <Text className="text-[13px] leading-5 text-ar-text">{data.description?.trim() ? data.description : "No description yet."}</Text>
          </View>
        )}

        {/* ── Related ── */}
        {resales.length > 0 && <RelatedGrid title="Fan resales" items={resales} />}
        {data?.creator && (related.data?.moreFromCreator.length ?? 0) > 0 && <RelatedGrid title={`More from ${data.creator.name}`} items={related.data!.moreFromCreator} />}
        {data && (related.data?.similar.length ?? 0) > 0 && <RelatedGrid title={`More ${media?.label ?? ""} items`} items={related.data!.similar} />}
      </ScrollView>
    </View>
  );
}

function RelatedGrid({ title, items }: { title: string; items: MarketListing[] }) {
  const rows: MarketListing[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View className="gap-3">
      <Text className="font-hud text-[10px] font-semibold uppercase tracking-[2.4px] text-ar-dim">{title}</Text>
      {rows.map((row) => (
        <View key={row.map((l) => l.id).join("-")} className="flex-row gap-3">
          {row.map((l) => (
            <MarketCard key={l.id} listing={l} />
          ))}
          {row.length === 1 && <View className="flex-1" />}
        </View>
      ))}
    </View>
  );
}
