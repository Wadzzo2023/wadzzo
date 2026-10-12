import { router, useLocalSearchParams } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { z } from "zod";

import { AuthScreen } from "~/components/auth/AuthScreen";
import { ArButton } from "~/components/ui/ArButton";
import { Field, FormError } from "~/components/ui/Field";
import { Text } from "~/components/ui/Text";
import { authErrorMessage } from "~/lib/auth/errors";
import { sendPasswordReset } from "~/lib/auth/signIn";
import { useColors } from "~/theme/theme";

export default function ForgotPasswordScreen() {
  const { c } = useColors();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const parsed = z.string().trim().email().safeParse(email);
    if (!parsed.success) {
      setError("Enter a valid email");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendPasswordReset(parsed.data);
      setDone(true);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthScreen eyebrow="Reset password" title="Check your email">
        <View className="mb-6 items-center">
          <View className="h-20 w-20 items-center justify-center rounded-[24px]" style={{ borderWidth: 1, borderColor: c("ar-green", 0.45), backgroundColor: c("ar-green", 0.12) }}>
            <KeyRound size={34} strokeWidth={1.8} color={c("ar-green-hot")} />
          </View>
        </View>
        {/* Same message whether or not an account exists — no enumeration. */}
        <Text className="text-center text-[14px] leading-6 text-ar-dim">
          If an account exists for <Text className="font-semibold text-ar-text">{email.trim()}</Text>, a reset link is on its way.
        </Text>
        <ArButton variant="primary" size="lg" block className="mt-7" onPress={() => router.replace("/auth/sign-in")}>
          Back to sign in
        </ArButton>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen eyebrow="Reset password" title="Forgot password?" body="Enter the email you signed up with and we'll send you a link to set a new one.">
      <View className="gap-4">
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" autoFocus returnKeyType="send" onSubmitEditing={() => void submit()} />
        <FormError message={error} />
        <ArButton variant="primary" size="lg" block busy={busy} onPress={() => void submit()}>
          Send reset link
        </ArButton>
        <ArButton variant="ghost" size="md" block onPress={() => router.replace("/auth/sign-in")}>
          Back to sign in
        </ArButton>
      </View>
    </AuthScreen>
  );
}
