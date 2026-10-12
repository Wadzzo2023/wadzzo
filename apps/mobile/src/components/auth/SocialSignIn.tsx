import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { Mail, Wallet } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { ArButton } from "~/components/ui/ArButton";
import { Text } from "~/components/ui/Text";
import { authErrorMessage } from "~/lib/auth/errors";
import { useSession } from "~/lib/auth/session";
import { whenNoSheet } from "~/lib/sheets";
import { signInWithApple, signInWithGoogle } from "~/lib/auth/signIn";
import { useColors } from "~/theme/theme";

/** Google's "G", drawn — no raster, crisp at any size. */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </Svg>
  );
}

/**
 * Apple (iOS) · Google · email · Albedo — the four sign-in methods, in the
 * order docs/03-auth.md sets. Used by the AuthGate sheet and the sign-in
 * screen, so both behave identically.
 */
export function SocialSignIn({ onEmail, compact = false }: { onEmail?: () => void; compact?: boolean }) {
  const { c, theme } = useColors();
  const hideGate = useSession((s) => s.hideGate);
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") void AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const run = async (kind: "google" | "apple") => {
    setBusy(kind);
    setError(null);
    try {
      await (kind === "google" ? signInWithGoogle() : signInWithApple());
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            theme === "dark"
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={22}
          style={{ height: 54, opacity: busy === "apple" ? 0.6 : 1 }}
          onPress={() => void run("apple")}
        />
      )}
      <ArButton size="lg" block busy={busy === "google"} onPress={() => void run("google")}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {busy !== "google" && <GoogleG />}
          <Text className="font-hud text-[15px] font-semibold uppercase tracking-[1.2px] text-ar-text">Continue with Google</Text>
        </View>
      </ArButton>

      {!compact && (
        <ArButton
          variant="primary"
          size="lg"
          block
          icon={Mail}
          onPress={() => {
            if (onEmail) onEmail();
            else {
              hideGate();
              // Not while the sheet is still up/closing — see whenNoSheet.
              whenNoSheet(() => router.push("/auth/sign-in"));
            }
          }}
        >
          Continue with email
        </ArButton>
      )}

      {error && (
        <Text className="rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5 text-[12px] leading-5 text-ar-danger">{error}</Text>
      )}

      <Pressable
        onPress={() => {
          hideGate();
          whenNoSheet(() => router.push("/auth/albedo"));
        }}
        accessibilityRole="button"
        className="flex-row items-center justify-center gap-2 py-2"
      >
        <Wallet size={14} strokeWidth={2.3} color={c("ar-text-faint")} />
        <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.3px] text-ar-faint">Use a Stellar wallet (Albedo)</Text>
      </Pressable>
    </View>
  );
}
