import { Compass, Crosshair, Frame, RotateCw, Zap } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { ArIconButton } from "~/components/ui/ArButton";
import { PulseRing } from "~/components/ui/PulseDot";
import { useColors } from "~/theme/theme";

/**
 * Port of the web's right-hand rail: recenter + refresh welded into one
 * capsule, then auto-collect and compass-map. (No QR button — QR lives behind
 * the AR tab.)
 */
export function MapControls({
  onRecenter,
  onRefetch,
  compassMode,
  onToggleCompass,
  refetching,
  following,
  autoCollect,
  onToggleAutoCollect,
  muralLayer,
  onCycleMuralLayer,
}: {
  onRecenter: () => void;
  onRefetch: () => void;
  compassMode: boolean;
  onToggleCompass: () => void;
  refetching: boolean;
  following: boolean;
  autoCollect: boolean;
  onToggleAutoCollect: () => void;
  /** Murals on the map: all, verified only, or hidden. */
  muralLayer?: "all" | "verified" | "off";
  onCycleMuralLayer?: () => void;
}) {
  const { c } = useColors();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (refetching) spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(spin);
      spin.value = withTiming(0, { duration: 200 });
    }
  }, [refetching, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", right: 14, top: "38%", alignItems: "flex-end", gap: 10, zIndex: 30 }}>
      <View
        className="overflow-hidden rounded-full border bg-ar-surface"
        style={{ borderColor: c("ar-line", 0.9) }}
      >
        <Pressable onPress={onRecenter} accessibilityRole="button" accessibilityLabel={following ? "Following your location" : "Recenter on your location"} accessibilityState={{ selected: following }} className="h-11 w-11 items-center justify-center">
          <Crosshair size={19} strokeWidth={2.1} color={following ? c("ar-green-hot") : c("ar-text-dim")} />
        </Pressable>
        <View className="mx-2.5 h-px bg-ar-line" />
        <Pressable onPress={onRefetch} disabled={refetching} accessibilityRole="button" accessibilityLabel={refetching ? "Loading pins" : "Refresh pins"} accessibilityState={{ busy: refetching, disabled: refetching }} className="h-11 w-11 items-center justify-center">
          <Animated.View style={spinStyle}>
            <RotateCw size={18} strokeWidth={2.1} color={c("ar-text-dim")} />
          </Animated.View>
        </Pressable>
      </View>

      <ArIconButton icon={Zap} label={autoCollect ? "Auto-collect on" : "Auto-collect off"} active={autoCollect} onPress={onToggleAutoCollect}>
        {autoCollect && <PulseRing color={c("ar-green-hot")} size={44} />}
      </ArIconButton>

      <ArIconButton icon={Compass} label={compassMode ? "Compass map on — switch to north up" : "Turn the map to your heading"} active={compassMode} onPress={onToggleCompass} />

      {onCycleMuralLayer && (
        <ArIconButton
          icon={Frame}
          label={muralLayer === "off" ? "Murals hidden — show them" : muralLayer === "verified" ? "Showing verified murals — hide murals" : "Showing all murals — verified only"}
          active={muralLayer !== "off"}
          onPress={onCycleMuralLayer}
        />
      )}
    </View>
  );
}
