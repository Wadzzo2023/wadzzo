import "../../global.css";
import "~/theme/interop";

import Mapbox from "@rnmapbox/maps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthGate } from "~/components/auth/AuthGate";
import { MuralPackHud } from "~/components/murals/MuralPackHud";
import { OnboardingSheet } from "~/components/auth/OnboardingSheet";
import { BootSequence } from "~/components/boot/BootSequence";
import { OfflineBanner } from "~/components/shell/OfflineBanner";
import { ApiError } from "~/lib/api/client";
import { warmFeedbackSounds } from "~/lib/ar/feedback";
import { useSession } from "~/lib/auth/session";
import { FONT_ASSETS } from "~/theme/fonts";
import { useResolvedTheme } from "~/theme/theme";
import { ThemeRoot } from "~/theme/ThemeRoot";

void SplashScreen.preventAutoHideAsync();
void Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server errors with a status are answers, not blips — don't hammer.
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
      staleTime: 15_000,
    },
  },
});

/** Once per cold start — same rule as the web (`hasBooted`). */
let bootPlayed = false;

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const hydrate = useSession((s) => s.hydrate);
  const [booting, setBooting] = useState(!bootPlayed);

  useEffect(() => {
    void hydrate();
    warmFeedbackSounds();
  }, [hydrate]);

  useEffect(() => {
    // The native splash is the boot sequence's first frame (same colour);
    // hand over as soon as fonts are in so the HUD type never flashes.
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeRoot>
            <ThemedStatusBar />
            <Stack
              screenOptions={{
                headerShown: false,
                // The web fades each screen up (200ms) rather than sliding.
                animation: "fade",
                animationDuration: 200,
                contentStyle: { backgroundColor: "transparent" },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="ar" options={{ animation: "fade", gestureEnabled: false }} />
              <Stack.Screen name="scan" options={{ animation: "fade", gestureEnabled: false }} />
              <Stack.Screen name="murals/index" options={{ animation: "fade", gestureEnabled: false }} />
              <Stack.Screen name="auth" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            </Stack>
            <OfflineBanner />
            <AuthGate />
            <MuralPackHud />
            <OnboardingSheet />
            {booting && (
              <BootSequence
                onDone={() => {
                  bootPlayed = true;
                  setBooting(false);
                }}
              />
            )}
          </ThemeRoot>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar() {
  const theme = useResolvedTheme();
  return <StatusBar style={theme === "dark" ? "light" : "dark"} />;
}
