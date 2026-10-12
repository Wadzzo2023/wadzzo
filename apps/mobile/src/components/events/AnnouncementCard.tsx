import { formatDistanceToNowStrict } from "date-fns";
import { Image } from "expo-image";
import { router } from "expo-router";
import { MessageCircle, Pin } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { TonePill } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { ArAnnouncement } from "~/lib/api/types";
import { useColors } from "~/theme/theme";

/** Port of the web AnnouncementCard: who, when, what, and the first image. */
export function AnnouncementCard({ announcement: a }: { announcement: ArAnnouncement }) {
  const { c } = useColors();
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/announcements/[id]", params: { id: a.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${a.brand.name}: ${a.title}`}
    >
      <Bevel className="overflow-hidden rounded-ar-lg" style={{ borderRadius: 22 }}>
        <View className="flex-row items-center gap-2.5 px-3.5 pt-3.5">
          <BrandAvatar src={a.brand.imageUrl} style={{ width: 32, height: 32, borderRadius: 10 }} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[12.5px] font-semibold text-ar-text">{a.brand.name}</Text>
            <Text className="font-hud text-[10px] text-ar-faint">{formatDistanceToNowStrict(new Date(a.createdAt), { addSuffix: true })}</Text>
          </View>
          {a.pinned && <TonePill tone="green" label="Pinned" icon={<Pin size={10} strokeWidth={2.6} color={c("ar-green-hot")} />} />}
        </View>

        <View className="px-3.5 pb-3 pt-2.5">
          <Text className="text-[15px] font-semibold leading-5 text-ar-text">{a.title}</Text>
          <Text numberOfLines={3} className="mt-1 text-[13px] leading-5 text-ar-dim">{a.body}</Text>
        </View>

        {a.images[0] && (
          <View className="mx-3.5 mb-3 overflow-hidden rounded-ar" style={{ height: 150, borderRadius: 16 }}>
            <Image source={{ uri: a.images[0] }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
            {a.images.length > 1 && (
              <Glass style={{ position: "absolute", right: 8, bottom: 8, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text className="font-hud text-[10px] font-semibold text-ar-text">+{a.images.length - 1}</Text>
              </Glass>
            )}
          </View>
        )}

        <View className="flex-row items-center gap-1 border-t border-ar-line px-3.5 py-2">
          <MessageCircle size={11} strokeWidth={2.5} color={c("ar-text-faint")} />
          <Text className="font-hud text-[10.5px] font-semibold text-ar-faint">
            {a.commentCount === 0 ? "Comment" : `${a.commentCount} comment${a.commentCount === 1 ? "" : "s"}`}
          </Text>
          {a.ctaLabel && a.ctaUrl ? (
            <Text numberOfLines={1} className="font-hud ml-auto text-[10.5px] font-semibold text-ar-green">{a.ctaLabel} →</Text>
          ) : null}
        </View>
      </Bevel>
    </Pressable>
  );
}

export function AnnouncementCardSkeleton() {
  return (
    <View className="rounded-ar-lg border border-ar-line bg-ar-surface p-3.5">
      <View className="flex-row items-center gap-2.5">
        <Skeleton className="h-8 w-8 rounded-[10px]" />
        <View className="flex-1">
          <Skeleton className="h-2.5 w-1/3 rounded-full" />
          <Skeleton className="mt-1.5 h-2 w-1/5 rounded-full" />
        </View>
      </View>
      <Skeleton className="mt-3.5 h-3.5 w-3/4 rounded-full" />
      <Skeleton className="mt-2 h-2.5 w-full rounded-full" />
      <Skeleton className="mt-1.5 h-2.5 w-2/3 rounded-full" />
    </View>
  );
}
