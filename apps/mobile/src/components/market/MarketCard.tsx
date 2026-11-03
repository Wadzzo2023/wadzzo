import { Image } from "expo-image";
import { router } from "expo-router";
import { Repeat2, ShoppingBag } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Bevel, Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { MarketListing } from "~/lib/api/types";
import { formatPrice, formatUsd, MEDIA, openMarketplace } from "~/lib/market";
import { useColors } from "~/theme/theme";

/** The platform token's code on cards (the API's listings don't carry it). */
export const TOKEN_CODE = "Wadzzo";

/**
 * One marketplace listing (port of the AR web app's MarketCard): the art, its creator, the price,
 * and "Go to Marketplace" — the app shows items but buying happens in the marketplace. The art and
 * name open the item here.
 */
export function MarketCard({ listing }: { listing: MarketListing }) {
  const { c } = useColors();
  const { asset } = listing;
  const resale = listing.placerId !== asset.creatorId;
  const left = asset.limit == null ? null : Math.max(0, asset.limit - asset.mintedCount);
  const Media = MEDIA[asset.mediaType]?.icon ?? MEDIA.IMAGE.icon;
  const usd = formatUsd(listing.priceUSD);
  const open = () =>
    router.push({
      pathname: "/marketplace/[id]",
      params: resale ? { id: String(asset.id), listing: String(listing.id) } : { id: String(asset.id) },
    });

  const badge = resale
    ? { text: "Resale", bg: c("rarity-epic", 0.9), fg: "#fff", icon: true }
    : left === 0
      ? { text: "Sold out", bg: c("ar-danger", 0.9), fg: "#fff", icon: false }
      : left != null && left <= 10
        ? { text: `${left} left`, bg: c("rarity-legendary", 0.9), fg: "#000", icon: false }
        : null;

  return (
    <Bevel className="flex-1 overflow-hidden rounded-ar" style={{ borderRadius: 16 }}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${asset.name}, open item`}>
        <View style={{ aspectRatio: 1 }}>
          <Image source={{ uri: asset.thumbnail }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
          <Glass className="absolute left-2 top-2 h-6 w-6 items-center justify-center rounded-full" style={{ borderRadius: 12 }}>
            <Media size={12} strokeWidth={2.4} color={c("ar-text")} />
          </Glass>
          {badge && (
            <View className="absolute right-2 top-2 flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: badge.bg }}>
              {badge.icon && <Repeat2 size={10} strokeWidth={2.8} color={badge.fg} />}
              <Text className="font-hud text-[9px] font-bold uppercase tracking-[1.1px]" style={{ color: badge.fg }}>
                {badge.text}
              </Text>
            </View>
          )}
        </View>
        <View className="px-2.5 pt-2.5">
          <Text numberOfLines={1} className="text-[13px] font-semibold text-ar-text">
            {asset.name}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-[11px] text-ar-faint">
            {resale ? `Resale by ${listing.placer?.name ?? "a fan"}` : (asset.creator?.name ?? "Wadzzo")}
          </Text>
          <View className="mt-2 flex-row items-baseline gap-1.5">
            <Text className="font-hud text-[15px] font-bold text-ar-green-hot">{formatPrice(listing.price)}</Text>
            <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.1px] text-ar-dim">{TOKEN_CODE}</Text>
            {usd && <Text className="ml-auto text-[10px] text-ar-faint">{usd}</Text>}
          </View>
        </View>
      </Pressable>
      <View className="p-2.5">
        <Pressable
          onPress={() => openMarketplace(asset.id, resale ? listing.id : null)}
          accessibilityRole="link"
          accessibilityLabel={`Go to Marketplace to buy ${asset.name}`}
          className="h-8 flex-row items-center justify-center gap-1.5 rounded-[10px]"
          style={{ backgroundColor: c("ar-green") }}
        >
          <ShoppingBag size={13} strokeWidth={2.4} color={c("ar-green-ink")} />
          <Text className="font-hud text-[10.5px] font-semibold uppercase tracking-[0.8px]" style={{ color: c("ar-green-ink") }}>
            Go to Marketplace
          </Text>
        </Pressable>
      </View>
    </Bevel>
  );
}
