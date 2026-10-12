import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Spinner } from "~/components/ui/Spinner";
import { useFeedbackSettings } from "~/lib/ar/feedback";

const ART = require("../../../assets/images/collect-button.png");

/** Rendered size of the art (a square; the green tile + "Collect" fill most of it). */
const SIZE = 124;

/**
 * The AR screen's collect action: the "Collect" scan-tile art as the button
 * itself. Same art on the web (`public/images/collect-button.png`).
 */
export function CollectButton({ title, busy, onPress }: { title: string; busy?: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const { haptics } = useFeedbackSettings();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Collect ${title}`}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      disabled={busy}
      onPressIn={() => {
        scale.set(withTiming(0.92, { duration: 90 }));
        if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }}
      onPressOut={() => scale.set(withTiming(1, { duration: 120 }))}
      onPress={onPress}
      style={{ alignSelf: "center" }}
    >
      <Animated.View style={[anim, { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }]}>
        <Image source={ART} style={{ width: SIZE, height: SIZE }} contentFit="contain" />
        {busy && (
          // Centred on the green tile (upper ~40% of the art), not the whole image.
          <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: SIZE * 0.395 - 13, alignItems: "center" }}>
            <Spinner size={26} color="#fff" />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}
