import { Compass, Crosshair } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useFeedback } from "~/lib/ar/feedback";
import { useColors, type MapMode } from "~/theme/theme";

import { MapModeButton } from "./MapModeButton";

/**
 * Port of the web's right-hand rail: recenter, compass map and 2D/3D, in one
 * capsule. Recenter also refreshes the
 * pins (they used to be two buttons welded into one capsule — "put me back and tell me what's
 * here"); a ring spins round it while pins load. Auto-collect and the murals layer are profile
 * settings now. (No QR button — QR lives behind the AR tab.)
 */
export function MapControls({
  onRecenter,
  compassMode,
  onToggleCompass,
  refetching,
  following,
  mapMode,
  onToggleMapMode,
}: {
  onRecenter: () => void;
  compassMode: boolean;
  onToggleCompass: () => void;
  refetching: boolean;
  following: boolean;
  /** Flat 2D or tilted 3D basemap. */
  mapMode?: MapMode;
  onToggleMapMode?: () => void;
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

  const { tap } = useFeedback();
  const divider = <View className="mx-2.5 h-px bg-ar-line" />;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", right: 14, top: "38%", zIndex: 30 }}>
      {/* One capsule: recenter (+ refresh), compass map, 2D/3D. */}
      <View className="overflow-hidden rounded-full border bg-ar-surface" style={{ borderColor: c("ar-line", 0.9) }}>
        <Pressable
          onPress={onRecenter}
          accessibilityRole="button"
          accessibilityLabel={refetching ? "Refreshing pins" : following ? "Following your location — tap to refresh pins" : "Recenter on your location and refresh pins"}
          accessibilityState={{ selected: following, busy: refetching }}
          className="h-11 w-11 items-center justify-center"
        >
          {/* The loading ring: a quarter arc spinning just inside the rim. */}
          <Animated.View
            pointerEvents="none"
            style={[
              spinStyle,
              { opacity: refetching ? 1 : 0, position: "absolute", inset: 3, borderRadius: 999, borderWidth: 2, borderColor: "transparent", borderTopColor: c("ar-green-hot") },
            ]}
          />
          <Crosshair size={19} strokeWidth={2.1} color={following ? c("ar-green-hot") : c("ar-text-dim")} />
        </Pressable>

        {divider}

        <Pressable
          onPress={() => {
            tap();
            onToggleCompass();
          }}
          accessibilityRole="button"
          accessibilityLabel={compassMode ? "Compass map on — switch to north up" : "Turn the map to your heading"}
          accessibilityState={{ selected: compassMode }}
          className="h-11 w-11 items-center justify-center"
        >
          <Compass size={18} strokeWidth={2.1} color={compassMode ? c("ar-green-hot") : c("ar-text-dim")} />
        </Pressable>

        {mapMode && onToggleMapMode && (
          <>
            {divider}
            <MapModeButton bare mode={mapMode} onToggle={onToggleMapMode} />
          </>
        )}
      </View>
    </View>
  );
}
