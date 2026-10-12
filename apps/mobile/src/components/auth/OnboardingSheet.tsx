import { Image } from "expo-image";
import { usePathname } from "expo-router";
import { Camera } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Text } from "~/components/ui/Text";
import { api } from "~/lib/api/client";
import { uploadProfileImage, type LocalFile } from "~/lib/api/upload";
import { useSession } from "~/lib/auth/session";
import { pickFromLibrary } from "~/lib/media";
import { useColors } from "~/theme/theme";

const FALLBACK = require("../../../assets/brand/wadzzo-mark.png");
/** Long enough for the /auth modal's slide-down to finish. */
const AUTH_DISMISS_MS = 450;

/**
 * "Make it yours" — shown once, after a first sign-in, and always skippable
 * (decided). It never blocks the action the viewer was on its way to do; the
 * resumed action runs underneath.
 */
export function OnboardingSheet() {
  const { c } = useColors();
  const wanted = useSession((s) => s.showOnboarding);
  // Sign-in happens on /auth/* modal screens. Presenting this sheet while
  // that modal is still dismissing stacks it on a disappearing screen (the
  // "frozen app" bug), so wait until we're off /auth and the dismiss is done.
  const pathname = usePathname();
  const onAuth = pathname.startsWith("/auth");
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!wanted || onAuth) return;
    const id = setTimeout(() => setSettled(true), AUTH_DISMISS_MS);
    return () => {
      clearTimeout(id);
      setSettled(false);
    };
  }, [wanted, onAuth]);
  const open = wanted && !onAuth && settled;
  const user = useSession((s) => s.user);
  const finish = useSession((s) => s.finishOnboarding);
  const patchUser = useSession((s) => s.patchUser);

  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<LocalFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(user?.name && !/\.\.\./.test(user.name) ? user.name : "");
      setAvatar(null);
      setError(null);
    }
  }, [open, user?.name]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {};
      if (name.trim().length >= 2) body.name = name.trim();
      if (avatar) body.image = await uploadProfileImage(avatar, "avatar");
      if (Object.keys(body).length) {
        await api("/me/profile", { method: "PATCH", body });
        patchUser(body);
      }
      finish();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={finish}>
      <View className="px-6 pb-2 pt-3">
        <Text className="font-hud mb-1 text-center text-[10px] font-semibold uppercase tracking-[3.2px] text-ar-green">Welcome</Text>
        <Text className="font-hud text-center text-[21px] font-bold text-ar-text">Make it yours</Text>
        <Text className="mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-5 text-ar-dim">
          A name and a face for your collection. You can change both any time in Profile.
        </Text>

        <Pressable
          onPress={async () => {
            const picked = await pickFromLibrary({ square: true });
            if (picked?.[0]) setAvatar(picked[0]);
          }}
          accessibilityRole="button"
          accessibilityLabel="Choose a profile picture"
          className="mx-auto mt-5 h-[88px] w-[88px] items-center justify-center"
        >
          <Image
            source={avatar ? { uri: avatar.uri } : user?.image ? { uri: user.image } : FALLBACK}
            style={{ width: 88, height: 88, borderRadius: 26, borderWidth: 2, borderColor: c("ar-green", 0.4) }}
            contentFit="cover"
          />
          <View className="absolute -bottom-1 -right-1 h-8 w-8 items-center justify-center rounded-full border border-ar-line bg-ar-surface-3">
            <Camera size={15} strokeWidth={2.3} color={c("ar-green-hot")} />
          </View>
        </Pressable>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Display name"
          placeholderTextColor={c("ar-text-faint")}
          maxLength={100}
          autoCapitalize="words"
          className="mt-5 h-12 rounded-ar border border-ar-line bg-ar-surface-2 px-4 text-[15px] text-ar-text"
          style={{ fontFamily: "Sora_400Regular" }}
        />

        {error && <Text className="mt-3 text-center text-[12px] text-ar-danger">{error}</Text>}

        <View className="mt-5 gap-2">
          <ArButton variant="primary" size="lg" block busy={busy} onPress={() => void save()}>
            Save
          </ArButton>
          <ArButton variant="ghost" size="md" block onPress={finish} disabled={busy}>
            Skip for now
          </ArButton>
        </View>
      </View>
    </BottomSheet>
  );
}
