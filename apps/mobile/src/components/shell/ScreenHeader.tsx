import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "~/components/ui/Text";
import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

import { ProfileButton } from "./ProfileButton";

/**
 * Port of the web's ScreenHeader: eyebrow + title, a trailing slot, and the
 * profile avatar on root screens. Pushed screens pass `back` and get a back
 * button instead of the avatar.
 */
export function ScreenHeader({
  eyebrow,
  title,
  trailing,
  back = false,
  onBack,
  className,
}: {
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
  back?: boolean;
  /** Replaces the default "go back" (e.g. to step back within the screen). */
  onBack?: () => void;
  className?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className={cn("z-20 flex-row items-end justify-between gap-3 px-5 pb-4", className)} style={{ paddingTop: insets.top + 16 }}>
      {back && <BackButton className="mb-0.5" onPress={onBack} />}
      <View className="min-w-0 flex-1">
        {eyebrow && (
          <Text className="font-hud mb-1 text-[10px] font-semibold uppercase tracking-[3.2px] text-ar-green">{eyebrow}</Text>
        )}
        <Text numberOfLines={1} className="font-hud text-[26px] font-bold leading-[28px] tracking-tight text-ar-text">
          {title}
        </Text>
      </View>
      {(trailing ?? !back) ? (
        <View className="flex-row items-center gap-2">
          {trailing}
          {!back && <ProfileButton />}
        </View>
      ) : null}
    </View>
  );
}

/** Round glass back button; with no history (opened from a link) → the map. */
export function BackButton({
  className,
  fallback = "/map",
  onPress,
}: {
  className?: string;
  fallback?: "/map" | "/bounty" | "/brands" | "/collection" | "/events";
  onPress?: () => void;
}) {
  const { c } = useColors();
  return (
    <Pressable
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace(fallback)))}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className={cn("h-9 w-9 items-center justify-center rounded-full border border-ar-line bg-ar-surface", className)}
    >
      <ChevronLeft size={17} strokeWidth={2.4} color={c("ar-text")} />
    </Pressable>
  );
}
