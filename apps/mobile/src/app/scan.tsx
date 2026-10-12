import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { Camera, Check, Flashlight, FlashlightOff, QrCode, Settings, TriangleAlert, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Mask, Path, Rect } from "react-native-svg";

import { CameraModeSwitch } from "~/components/ar/CameraModeSwitch";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Spinner } from "~/components/ui/Spinner";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useCollectByQr } from "~/lib/api/queries";
import { pinIdFromScan } from "~/lib/ar/qr";
import { useSession } from "~/lib/auth/session";
import { useDecorativeMotion } from "~/lib/motion";
import { useColors } from "~/theme/theme";

type Phase = "scanning" | "claiming" | "done" | "failed";
const BOX = 228;
/** The brackets sit 3 px inside BOX with an 18 px corner radius; the hole matches. */
const HOLE_INSET = 3;
const HOLE_RADIUS = 18;

/**
 * ── /scan ──────────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's QR path — the one that needs no location and works in a
 * basement. `/scan` decodes off the camera; `/scan?pin=<id>` is the deep link
 * a printed code opens (phone camera → app) and claims without the camera.
 * Torch toggle is an approved native addition.
 */
export default function ScanScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { pin: deepLinkPin } = useLocalSearchParams<{ pin?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const requireAuth = useSession((s) => s.requireAuth);
  const collect = useCollectByQr();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [message, setMessage] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [overlay, setOverlay] = useState<{ width: number; height: number } | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!deepLinkPin && permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [deepLinkPin, permission, requestPermission]);

  const claim = useCallback(
    (id: string) => {
      if (handled.current === id) return;
      handled.current = id;
      const run = () => {
        setPhase("claiming");
        setMessage(null);
        collect.mutate(id, {
          onSuccess: () => {
            setPhase("done");
            setTimeout(() => router.replace(`/collection/${id}`), 1100);
          },
          onError: (err) => {
            setPhase("failed");
            setMessage(err.message);
            setTimeout(() => {
              handled.current = null;
              setPhase("scanning");
              setMessage(null);
            }, 3200);
          },
        });
      };
      if (!requireAuth("collect", run)) {
        handled.current = null;
        return;
      }
      run();
    },
    [collect, requireAuth],
  );

  useEffect(() => {
    if (deepLinkPin) claim(deepLinkPin);
  }, [deepLinkPin, claim]);

  const liveSweep = useDecorativeMotion();
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (!liveSweep) {
      cancelAnimation(sweep);
      return;
    }
    sweep.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [sweep, liveSweep]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value * (BOX - 8) }] }));

  const scanning = !deepLinkPin && phase === "scanning" && permission?.granted;
  const denied = permission && !permission.granted && !permission.canAskAgain;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {!deepLinkPin && permission?.granted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={
            scanning
              ? ({ data }) => {
                  const id = pinIdFromScan(data);
                  if (!id) {
                    setMessage("That isn't a Wadzzo code.");
                    return;
                  }
                  claim(id);
                }
              : undefined
          }
        />
      )}

      {/* Dim everything except the scan square — a rounded-square hole that
          lines up exactly with the corner brackets (was a circle). */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setOverlay(e.nativeEvent.layout)}>
        {overlay && (
          <Svg width={overlay.width} height={overlay.height}>
            <Defs>
              <Mask id="hole">
                <Rect width="100%" height="100%" fill="#fff" />
                <Rect
                  x={overlay.width / 2 - BOX / 2 + HOLE_INSET}
                  y={overlay.height * 0.44 - BOX / 2 + HOLE_INSET}
                  width={BOX - HOLE_INSET * 2}
                  height={BOX - HOLE_INSET * 2}
                  rx={HOLE_RADIUS}
                  fill="#000"
                />
              </Mask>
            </Defs>
            <Rect width="100%" height="100%" fill={c("ar-void", 0.72)} mask="url(#hole)" />
          </Svg>
        )}
      </View>

      <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "44%", width: BOX, height: BOX, marginLeft: -BOX / 2, marginTop: -BOX / 2 }}>
        <Svg width={BOX} height={BOX} viewBox="0 0 228 228">
          {["M3 62V21a18 18 0 0 1 18-18h41", "M166 3h41a18 18 0 0 1 18 18v41", "M225 166v41a18 18 0 0 1-18 18h-41", "M62 225H21a18 18 0 0 1-18-18v-41"].map((d) => (
            <Path key={d} d={d} stroke={c("ar-green-hot")} strokeWidth={4} strokeLinecap="round" fill="none" />
          ))}
        </Svg>
        {scanning && <Animated.View style={[{ position: "absolute", left: 16, right: 16, top: 4, height: 2, borderRadius: 1, backgroundColor: c("ar-green-hot") }, sweepStyle]} />}
      </View>

      <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 14, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", zIndex: 20 }}>
        {!deepLinkPin && permission?.granted ? (
          <Pressable onPress={() => setTorch((t) => !t)} accessibilityLabel={torch ? "Turn torch off" : "Turn torch on"}>
            <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", ...(torch ? { borderColor: c("ar-green", 0.6) } : {}) }}>
              {torch ? <Flashlight size={16} strokeWidth={2.2} color={c("ar-green-hot")} /> : <FlashlightOff size={16} strokeWidth={2.2} color={c("ar-text-dim")} />}
            </Glass>
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
        {!deepLinkPin ? <CameraModeSwitch mode="qr" /> : <View />}
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/map"))} accessibilityLabel="Close scanner">
          <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
            <X size={17} strokeWidth={2.4} color={c("ar-text")} />
          </Glass>
        </Pressable>
      </View>

      {phase !== "scanning" && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={[StyleSheet.absoluteFill, { zIndex: 30, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: c("ar-void", 0.8) }]}>
          <Glass style={{ width: "100%", maxWidth: 304, borderRadius: 22, padding: 24, alignItems: "center" }}>
            {phase === "claiming" && (
              <>
                <Spinner />
                <Text className="font-hud mt-3 text-[12.5px] font-bold uppercase tracking-[1.5px] text-ar-text">Claiming</Text>
              </>
            )}
            {phase === "done" && (
              <>
                <Animated.View entering={ZoomIn.springify().stiffness(320).damping(18)} style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c("ar-green", 0.6), backgroundColor: c("ar-green", 0.18) }}>
                  <Check size={24} strokeWidth={3} color={c("ar-green-hot")} />
                </Animated.View>
                <Text className="font-hud mt-3 text-[13px] font-bold uppercase tracking-[1.5px] text-ar-green-hot">Collected</Text>
                <Text className="mt-1.5 text-[11.5px] text-ar-dim">Opening your collectible…</Text>
              </>
            )}
            {phase === "failed" && (
              <>
                <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c("ar-danger", 0.6), backgroundColor: c("ar-danger", 0.15) }}>
                  <TriangleAlert size={22} strokeWidth={2.4} color={c("ar-danger")} />
                </View>
                <Text className="font-hud mt-3 text-[12.5px] font-bold uppercase tracking-[1.5px] text-ar-text">Couldn't collect</Text>
                <Text className="mt-1.5 text-center text-[11.5px] leading-5 text-ar-dim">{message}</Text>
                {deepLinkPin && (
                  <ArLinkButton href={`/collection/${deepLinkPin}`} size="sm" block className="mt-3">
                    View the drop
                  </ArLinkButton>
                )}
              </>
            )}
          </Glass>
        </Animated.View>
      )}

      {!deepLinkPin && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: Math.max(24, insets.bottom + 8), zIndex: 20 }}>
          <Glass style={{ alignSelf: "center", width: "100%", maxWidth: 336, borderRadius: 22, padding: 16, alignItems: "center" }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 10, borderWidth: 1, borderColor: c("ar-green", 0.5), backgroundColor: c("ar-green", 0.15) }}>
              <QrCode size={17} strokeWidth={2.3} color={c("ar-green-hot")} />
            </View>
            <Text className="font-hud text-[12.5px] font-bold uppercase tracking-[1.5px] text-ar-text">
              {permission?.granted ? "Point at a Wadzzo code" : denied ? "Camera blocked" : "Starting camera…"}
            </Text>
            <Text className="mt-1.5 max-w-[17rem] text-center text-[11.5px] leading-5 text-ar-dim">
              {message && phase === "scanning"
                ? message
                : permission?.granted
                  ? "Storefront and indoor drops use a printed code — no location permission needed."
                  : denied
                    ? "Allow camera access for Wadzzo in Settings, then come back."
                    : "One moment."}
            </Text>
            {denied ? (
              <ArButton variant="primary" block icon={Settings} className="mt-3" onPress={() => void Linking.openSettings()}>
                Open Settings
              </ArButton>
            ) : permission && !permission.granted ? (
              <ArButton variant="primary" block icon={Camera} className="mt-3" onPress={() => void requestPermission()}>
                Allow camera
              </ArButton>
            ) : null}
            <ArLinkButton href="/map" variant="ghost" size="sm" block className="mt-2" replace>
              Back to the map
            </ArLinkButton>
          </Glass>
        </View>
      )}
    </View>
  );
}
