import { format } from "date-fns";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ExternalLink, Pin, Share2 } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { CommentsSection } from "~/components/events/Comments";
import { BackButton } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { TonePill } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useAnnouncementQuery } from "~/lib/api/queries";
import { announcementWebUrl } from "~/lib/ar/events";
import { useColors } from "~/theme/theme";

/**
 * ── /announcements/[id] ────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's announcement page: every image (swipeable), the full
 * body, the brand's call to action, and comments. Expired posts 404.
 */
export default function AnnouncementScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const detail = useAnnouncementQuery(id);
  const a = detail.data;
  const [index, setIndex] = useState(0);
  const imageWidth = width - 40;

  if (detail.isLoading) {
    return (
      <View className="flex-1 bg-ar-bg px-5" style={{ paddingTop: insets.top + 70 }}>
        <Skeleton className="h-3 w-1/3 rounded-full" />
        <Skeleton className="mt-4 h-5 w-4/5 rounded-full" />
        <Skeleton className="mt-4 h-24 w-full" />
        <Skeleton className="mt-5 h-[200px] w-full rounded-ar-lg" />
      </View>
    );
  }
  if (!a) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ar-bg px-8">
        <Text className="text-center font-hud text-[15px] font-bold uppercase tracking-[1.8px] text-ar-dim">
          {(detail.error as { status?: number } | null)?.status === 404 ? "This post is no longer available" : "Couldn't load this post"}
        </Text>
        <ArLinkButton href="/events?tab=announcements" variant="primary">All news</ArLinkButton>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} className="bg-ar-bg">
      <View className="flex-row items-center justify-between px-4 pb-2" style={{ paddingTop: insets.top + 14 }}>
        <BackButton fallback="/events" />
        <Pressable onPress={() => void Share.share({ title: a.title, message: `${a.title}\n${announcementWebUrl(a.id)}`, url: announcementWebUrl(a.id) })} accessibilityLabel="Share this post">
          <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
            <Share2 size={15} strokeWidth={2.2} color={c("ar-text")} />
          </Glass>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.push(`/brands/${a.brand.id}`)} className="mt-2 flex-row items-center gap-2.5 self-start">
          <BrandAvatar src={a.brand.imageUrl} style={{ width: 40, height: 40, borderRadius: 12 }} />
          <View>
            <Text className="text-[13.5px] font-semibold text-ar-text">{a.brand.name}</Text>
            <Text className="font-hud text-[10.5px] text-ar-faint">{format(new Date(a.createdAt), "d MMM yyyy · h:mm a")}</Text>
          </View>
        </Pressable>

        {a.pinned && (
          <View className="mt-3 self-start">
            <TonePill tone="green" label="Pinned" icon={<Pin size={10} strokeWidth={2.6} color={c("ar-green-hot")} />} />
          </View>
        )}

        <Text className="mt-3 text-[21px] font-semibold leading-7 text-ar-text">{a.title}</Text>
        <Text selectable className="mt-2.5 text-[14px] leading-[22px] text-ar-dim">{a.body}</Text>

        {a.images.length > 0 && (
          <View className="mt-4 overflow-hidden" style={{ borderRadius: 22 }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / imageWidth))}
              scrollEventThrottle={32}
            >
              {a.images.map((src) => (
                <Image key={src} source={{ uri: src }} style={{ width: imageWidth, height: 280 }} contentFit="cover" transition={200} />
              ))}
            </ScrollView>
            {a.images.length > 1 && (
              <View pointerEvents="none" style={{ position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 }}>
                {a.images.map((src, i) => (
                  <View key={src} style={{ height: 6, width: i === index ? 16 : 6, borderRadius: 3, backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.5)" }} />
                ))}
              </View>
            )}
          </View>
        )}

        {a.ctaUrl ? (
          <ArButton block size="lg" variant="primary" iconRight={ExternalLink} className="mt-5" onPress={() => void WebBrowser.openBrowserAsync(a.ctaUrl!)}>
            {a.ctaLabel ?? "Learn more"}
          </ArButton>
        ) : null}

        <View className="mt-8">
          <CommentsSection target={{ kind: "announcement", id: a.id }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
