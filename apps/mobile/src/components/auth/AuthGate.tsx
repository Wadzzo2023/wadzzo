import { Wallet } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Text } from "~/components/ui/Text";
import { GATE_COPY } from "~/lib/auth/gateCopy";
import { useSession } from "~/lib/auth/session";
import { useAmbientMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

import { SocialSignIn } from "./SocialSignIn";

/**
 * ── AuthGate ───────────────────────────────────────────────────────────────
 *
 * Port of the web's single read/write boundary: everything is browsable
 * signed out, and this sheet appears only at the moment of an action —
 * collect, follow, join, chat. Same emblem and copy as the web; on native the
 * sign-in methods sit right here instead of behind a second dialog, and the
 * action the viewer tried resumes as soon as they're in (session.ts).
 */
export function AuthGate() {
  const { c } = useColors();
  const gate = useSession((s) => s.gate);
  const closeGate = useSession((s) => s.closeGate);
  const copy = gate ? GATE_COPY[gate] : null;

  const livePulse = useAmbientMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!livePulse) {
      cancelAnimation(pulse);
      return;
    }
    if (!gate) return;
    pulse.value = 0;
    pulse.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }), -1);
  }, [gate, pulse, livePulse]);
  const ring = useAnimatedStyle(() => {
    const t = pulse.value < 0.5 ? pulse.value * 2 : (1 - pulse.value) * 2;
    return { opacity: 0.7 * (1 - t), transform: [{ scale: 1 + 0.28 * t }] };
  });

  return (
    <BottomSheet open={Boolean(gate)} onClose={closeGate} maxHeight="92%">
      {copy && (
        <View className="px-6 pb-2 pt-4">
          <View className="mx-auto mb-5 h-[72px] w-[72px] items-center justify-center">
            <Animated.View style={[{ position: "absolute", inset: 0, borderRadius: 36, borderWidth: 1, borderColor: c("ar-green", 0.5) }, ring]} />
            <View
              className="h-[62px] w-[62px] items-center justify-center rounded-full bg-ar-surface-3"
              style={{ borderWidth: 1, borderColor: c("ar-green", 0.5), borderBottomWidth: 3, borderBottomColor: c("ar-void") }}
            >
              <Wallet size={26} strokeWidth={2} color={c("ar-green-hot")} />
            </View>
          </View>

          <Text className="font-hud text-center text-[21px] font-bold leading-7 text-ar-text">{copy.title}</Text>
          <Text className="mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-5 text-ar-dim">{copy.body}</Text>

          <View className="mt-6">
            <SocialSignIn />
          </View>

          <ArButton variant="ghost" size="md" block onPress={closeGate} className="mt-1">
            Keep looking around
          </ArButton>
        </View>
      )}
    </BottomSheet>
  );
}
