import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Linking, Pressable, View, type TextInput } from "react-native";
import { z } from "zod";

import { AuthScreen } from "~/components/auth/AuthScreen";
import { ArButton } from "~/components/ui/ArButton";
import { Field, FormError } from "~/components/ui/Field";
import { Text } from "~/components/ui/Text";
import { authErrorMessage } from "~/lib/auth/errors";
import { registerWithEmail } from "~/lib/auth/signIn";
import { useColors } from "~/theme/theme";

const schema = z
  .object({
    name: z.string().trim().min(2, "At least 2 characters").max(100),
    email: z.string().trim().email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = ["Too short", "Weak", "Okay", "Good", "Strong"];

export default function RegisterScreen() {
  const { c } = useColors();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = { email: useRef<TextInput>(null), password: useRef<TextInput>(null), confirm: useRef<TextInput>(null) };
  const s = useMemo(() => strength(form.password), [form.password]);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const f = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v?.[0]])));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await registerWithEmail(parsed.data.name, parsed.data.email, parsed.data.password);
      router.replace({ pathname: "/auth/verify-email", params: { email: parsed.data.email.toLowerCase() } });
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const meter = [c("ar-danger"), c("ar-danger"), c("rarity-legendary"), c("ar-green"), c("ar-green-hot")][s]!;

  return (
    <AuthScreen eyebrow="Start collecting" title="Create account" body="Free, and yours forever. We'll set up a wallet for you — no crypto know-how needed.">
      <View className="gap-4">
        <Field label="Name" value={form.name} onChangeText={set("name")} error={errors.name} autoCapitalize="words" autoComplete="name" returnKeyType="next" onSubmitEditing={() => refs.email.current?.focus()} />
        <Field ref={refs.email} label="Email" value={form.email} onChangeText={set("email")} error={errors.email} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="next" onSubmitEditing={() => refs.password.current?.focus()} />
        <View>
          <Field ref={refs.password} label="Password" value={form.password} onChangeText={set("password")} error={errors.password} secure autoComplete="new-password" textContentType="newPassword" returnKeyType="next" onSubmitEditing={() => refs.confirm.current?.focus()} />
          {form.password.length > 0 && (
            <View className="mt-2 flex-row items-center gap-2">
              <View className="flex-1 flex-row gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} className="h-1 flex-1 rounded-full" style={{ backgroundColor: i < s ? meter : c("ar-surface-3") }} />
                ))}
              </View>
              <Text className="font-hud w-16 text-right text-[10px] font-semibold uppercase tracking-[1px]" style={{ color: meter }}>
                {STRENGTH[s]}
              </Text>
            </View>
          )}
        </View>
        <Field ref={refs.confirm} label="Confirm password" value={form.confirm} onChangeText={set("confirm")} error={errors.confirm} secure autoComplete="new-password" returnKeyType="go" onSubmitEditing={() => void submit()} />
        <FormError message={formError} />
        <ArButton variant="primary" size="lg" block busy={busy} onPress={() => void submit()}>
          Create account
        </ArButton>
        <Text className="text-center text-[11.5px] leading-5 text-ar-faint">
          By continuing you agree to Wadzzo's{" "}
          <Text className="text-ar-dim underline" onPress={() => void Linking.openURL("https://app.wadzzo.com/privacy")}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
      <View className="mt-6 flex-row justify-center gap-1.5">
        <Text className="text-[13px] text-ar-dim">Already have an account?</Text>
        <Pressable onPress={() => router.replace("/auth/sign-in")} hitSlop={8}>
          <Text className="text-[13px] font-semibold text-ar-green">Sign in</Text>
        </Pressable>
      </View>
    </AuthScreen>
  );
}
