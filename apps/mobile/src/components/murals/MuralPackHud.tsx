import { router } from "expo-router";
import { Frame, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, InteractionManager, Pressable, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "~/components/ui/BottomSheet";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { startMuralPack, useMuralPack, usePackSheet } from "~/lib/murals/pack";
import { sfx } from "~/lib/murals/sfx";
import { useColors } from "~/theme/theme";

import { PackArt } from "./PackArt";
import { PackPanel } from "./PackPanel";

/**
 * ── MuralPackHud (mobile) ──────────────────────────────────────────────────
 *
 * Mounted once in the root layout. Starts the mural pack install shortly
 * after launch (LAUNCH_DELAY_MS, once the first screen has settled, so the
 * first location fix and map load get the network and CPU first — opening
 * the Murals camera still starts it at once), resumes it whenever the app
 * comes back to the foreground, hosts the
 * game-style panel (opened from the AR-button ring's % badge), and when the
 * pack finishes shows a "Mural pack ready" toast with a shortcut + fanfare.
 */
const LAUNCH_DELAY_MS = 3000;

export function MuralPackHud() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const justFinished = useMuralPack((s) => s.justFinished);
  const open = usePackSheet((x) => x.open);
  const setOpen = usePackSheet((x) => x.setOpen);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => void startMuralPack(), LAUNCH_DELAY_MS);
    });
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void startMuralPack();
    });
    return () => {
      task.cancel();
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  const seen = useRef(0);
  useEffect(() => {
    if (!justFinished || justFinished === seen.current) return;
    seen.current = justFinished;
    sfx.packReady();
    setToast(true);
    const t = setTimeout(() => setToast(false), 6000);
    return () => clearTimeout(t);
  }, [justFinished]);

  return (
    <>
      {toast && (
        <Animated.View entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp} style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, zIndex: 60 }}>
          <Glass style={{ borderRadius: 18, padding: 10, flexDirection: "row", alignItems: "center", gap: 12, borderColor: c("ar-green", 0.5) }}>
            <PackArt size={40} done />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-hud text-[12px] font-bold uppercase tracking-[1.4px] text-ar-text">Mural pack ready</Text>
              <Text className="text-[11px] text-ar-dim" numberOfLines={1}>
                Find street art and earn Wadzzo Coins.
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setToast(false);
                router.push("/murals");
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: c("ar-green"), paddingHorizontal: 12, height: 32 }}
            >
              <Frame size={12} color={c("ar-green-ink")} />
              <Text className="font-hud text-[10.5px] font-bold uppercase tracking-[1px]" style={{ color: c("ar-green-ink") }}>
                Try it
              </Text>
            </Pressable>
            <Pressable onPress={() => setToast(false)} hitSlop={8} accessibilityLabel="Dismiss">
              <X size={15} color={c("ar-text-faint")} />
            </Pressable>
          </Glass>
        </Animated.View>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <PackPanel />
      </BottomSheet>
    </>
  );
}
