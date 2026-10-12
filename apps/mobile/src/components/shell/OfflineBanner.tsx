import NetInfo from "@react-native-community/netinfo";
import { WifiOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "~/components/ui/Text";
import { useColors } from "~/theme/theme";

/** A slim bar under the status bar while offline; cached data stays visible. */
export function OfflineBanner() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  useEffect(
    () => NetInfo.addEventListener((s) => setOffline(s.isConnected === false || s.isInternetReachable === false)),
    [],
  );
  if (!offline) return null;
  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      pointerEvents="none"
      style={{ position: "absolute", top: insets.top + 4, left: 0, right: 0, alignItems: "center", zIndex: 90 }}
    >
      <View className="flex-row items-center gap-1.5 rounded-full border border-ar-line bg-ar-surface px-3 py-1.5">
        <WifiOff size={12} strokeWidth={2.4} color={c("ar-danger")} />
        <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.3px] text-ar-dim">Offline — showing saved data</Text>
      </View>
    </Animated.View>
  );
}
