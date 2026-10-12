import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, View, type TextInput } from "react-native";
import { z } from "zod";

import { AuthScreen } from "~/components/auth/AuthScreen";
import { SocialSignIn } from "~/components/auth/SocialSignIn";
import { ArButton } from "~/components/ui/ArButton";
import { Field, FormError } from "~/components/ui/Field";
import { Text } from "~/components/ui/Text";
import { authErrorCode, authErrorMessage, UNVERIFIED } from "~/lib/auth/errors";
import { signInWithEmail } from "~/lib/auth/signIn";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors({ email: f.email?.[0], password: f.password?.[0] });
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await signInWithEmail(parsed.data.email, parsed.data.password);
      router.dismissAll();
    } catch (e) {
      if (authErrorCode(e) === UNVERIFIED) {
        // The server has just re-sent the link.
        router.push({ pathname: "/auth/verify-email", params: { email: parsed.data.email, resent: "1" } });
      } else {
        setFormError(authErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthScreen eyebrow="Welcome back" title="Sign in" body="Your collection, follows and bounties are waiting.">
      <SocialSignIn compact />

      <View className="my-6 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-ar-line" />
        <Text className="font-hud text-[10px] font-semibold uppercase tracking-[2px] text-ar-faint">or with email</Text>
        <View className="h-px flex-1 bg-ar-line" />
      </View>

      <View className="gap-4">
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secure
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Pressable onPress={() => router.push({ pathname: "/auth/forgot-password", params: { email } })} className="self-end" hitSlop={8}>
          <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.2px] text-ar-green">Forgot password?</Text>
        </Pressable>
        <FormError message={formError} />
        <ArButton variant="primary" size="lg" block busy={busy} onPress={() => void submit()}>
          Sign in
        </ArButton>
      </View>

      <View className="mt-6 flex-row justify-center gap-1.5">
        <Text className="text-[13px] text-ar-dim">New here?</Text>
        <Pressable onPress={() => router.replace("/auth/register")} hitSlop={8}>
          <Text className="text-[13px] font-semibold text-ar-green">Create account</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
