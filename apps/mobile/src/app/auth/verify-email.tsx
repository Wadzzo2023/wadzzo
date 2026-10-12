import { router, useLocalSearchParams } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";

import { AuthScreen } from "~/components/auth/AuthScreen";
import { ArButton } from "~/components/ui/ArButton";
import { Field, FormError } from "~/components/ui/Field";
import { Text } from "~/components/ui/Text";
import { authErrorMessage } from "~/lib/auth/errors";
import { resendVerification } from "~/lib/auth/signIn";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

const COOLDOWN = 60;

/** "Check your inbox" — after register, or after signing in unverified. */
export default function VerifyEmailScreen() {
  const { c } = useColors();
  const { email = "", resent } = useLocalSearchParams<{ email?: string; resent?: string }>();
  const [cooldown, setCooldown] = useState(resent ? COOLDOWN : 0);
  const [askPassword, setAskPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(Boolean(resent));

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const liveBob = useDecorativeMotion();
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!liveBob) {
      cancelAnimation(bob);
      return;
    }
    bob.value = withRepeat(withSequence(withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })), -1);
  }, [bob, liveBob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));

  const resend = async () => {
    // Firebase only sends verification to a signed-in user, so this needs
    // the password once.
    if (!askPassword) {
      setAskPassword(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resendVerification(email, password);
      setSent(true);
      setCooldown(COOLDOWN);
      setAskPassword(false);
      setPassword("");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen eyebrow="One more step" title="Check your inbox">
      <Animated.View style={bobStyle} className="mb-6 items-center">
        <View className="h-20 w-20 items-center justify-center rounded-[24px]" style={{ borderWidth: 1, borderColor: c("ar-green", 0.45), backgroundColor: c("ar-green", 0.12) }}>
          <MailCheck size={36} strokeWidth={1.8} color={c("ar-green-hot")} />
        </View>
      </Animated.View>
      <Text className="text-center text-[14px] leading-6 text-ar-dim">
        {sent ? "We sent a new verification link to" : "We sent a verification link to"}
      </Text>
      <Text className="mt-1 text-center text-[15px] font-semibold text-ar-text">{email}</Text>
      <Text className="mt-3 text-center text-[12.5px] leading-5 text-ar-faint">Tap the link in that email, then come back and sign in. Check spam if it's not there.</Text>

      <View className="mt-7 gap-2.5">
        <ArButton
          variant="primary"
          size="lg"
          block
          onPress={() => void Linking.openURL(Platform.OS === "ios" ? "message://" : "mailto:")}
        >
          Open mail app
        </ArButton>
        <ArButton size="lg" block onPress={() => router.replace("/auth/sign-in")}>
          I've verified — sign in
        </ArButton>
        {askPassword && (
          <Field label="Password" value={password} onChangeText={setPassword} secure autoFocus returnKeyType="send" onSubmitEditing={() => void resend()} className="mt-2" />
        )}
        <FormError message={error} />
        <ArButton variant="ghost" size="md" block busy={busy} disabled={cooldown > 0} onPress={() => void resend()}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : askPassword ? "Send new link" : "Resend link"}
        </ArButton>
      </View>
    </AuthScreen>
  );
}
