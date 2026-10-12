import { ViroARSceneNavigator, type ViroCameraTransform } from "@reactvision/react-viro";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Crosshair } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeInUp, FadeOutDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArPermissionGate, type PermState } from "~/components/ar/ArPermissionGate";
import { ArWorld, PIN_SIZE, type ArWorldProps, type PlacedPin } from "~/components/ar/ArWorld";
import { CompassStrip, EdgeArrows, Radar, Reticle } from "~/components/ar/ArHud";
import { CameraModeSwitch } from "~/components/ar/CameraModeSwitch";
import { CollectButton } from "~/components/ar/CollectButton";
import { CollectCelebration } from "~/components/fx/CollectCelebration";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useCollectPin, usePinQuery } from "~/lib/api/queries";
import { useFeedback } from "~/lib/ar/feedback";
import { AR_CAPTURE_RADIUS, distanceMeters, formatDistance } from "~/lib/ar/geo";
import { useGeolocation, useHeading } from "~/lib/ar/location";
import { pinArea, useDiscoveryPins } from "~/lib/ar/pins";
import { isCapturable } from "~/lib/ar/rarity";
import { checkPermissions, requestPermissions, type PermKey, type PermStates } from "~/lib/camera/permissions";
import type { ArPin } from "~/lib/ar/types";
import { useSession } from "~/lib/auth/session";
import { aimAngle, calibrate, legibilityScale, placeInScene, relativeYaw, viewOnlyTarget, yawFromForward, type Calibration } from "~/lib/viro/placement";
import { PIN_RADIUS_M } from "~/lib/viro/coinGeometry";
import { useColors } from "~/theme/theme";

const MAX_PINS = 25;
/**
 * Pins within this distance are placed in AR; they become capturable inside
 * AR_CAPTURE_RADIUS (75 m — also what the server enforces). The ones between
 * 75 and 200 m show as "walk closer".
 */
const AR_VISIBLE_RADIUS_M = 200;
const FOCUS_OPEN_MS = 550;
const FOCUS_CLOSE_MS = 400;

type Pose = { position: number[]; forward: number[] };

/**
 * ── /ar ────────────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's AR screen onto ViroReact. Same rules:
 *  - only pins you can capture *right now* are placed (not locked, not
 *    already yours) — except `?pin=`, the single-pin "view in AR" mode, which
 *    exists to revisit owned cards and ignores range (drawn ≤30 m away on its
 *    true bearing);
 *  - `?target=` prefers one pin once it's in the focus cone;
 *  - aiming is the pointer: a pin under the reticle for 550 ms opens its card,
 *    400 ms off it closes it;
 *  - the capture is only celebrated after the server records it.
 */
export default function ArScreen() {
  const { c, rarity: rc } = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ pin?: string; target?: string }>();
  const focusPinId = params.pin;
  const preferPinId = params.target;

  const focused = useIsFocused();
  const [perm, setPerm] = useState<Record<"camera" | "location" | "motion", PermState>>({ camera: "pending", location: "pending", motion: "pending" });
  const [entered, setEntered] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Skip the gate once the camera is allowed and location has been answered.
  // The camera launcher explains these before routing here, so a user who
  // already said no to location isn't stopped a second time — the AR HUD
  // shows "Finding your location…" instead. Deep links (/ar?target=…) that
  // skip the launcher still meet the gate if nothing's been asked yet.
  useEffect(() => {
    void (async () => {
      const { states } = await checkPermissions(AR_PERMS);
      const next = asGateStates(states);
      setPerm(next);
      if (next.camera === "granted" && next.location !== "pending") setEntered(true);
    })();
  }, []);

  const request = useCallback(async () => {
    setRequesting(true);
    setGateError(null);
    const next = asGateStates((await requestPermissions(AR_PERMS)).states);
    setPerm(next);
    setRequesting(false);
    if (next.camera !== "granted") {
      setGateError("AR needs the camera. Allow it in Settings to continue.");
      return;
    }
    if (next.location !== "granted") setGateError("Without location, pins can't be placed — you'll see an empty scene.");
    setEntered(true);
  }, []);

  if (!entered) return <ArPermissionGate states={perm} requesting={requesting} onRequest={() => void request()} error={gateError} />;

  // The AR session (ARKit + camera + per-frame pose callbacks into JS) only
  // lives while this screen is in front. A device CPU report caught ARKit
  // still running while the app sat on the map — 60% CPU and memory climbing
  // ~3 MB/s until the whole app froze. Unmounting the navigator tears it down.
  if (!focused) return <View style={{ flex: 1, backgroundColor: "#000" }} />;

  return <ArSession focusPinId={focusPinId} preferPinId={preferPinId} insetsTop={insets.top} insetsBottom={insets.bottom} c={c} rc={rc} />;
}

const AR_PERMS: PermKey[] = ["camera", "location", "motion"];

function asGateStates(s: PermStates): Record<"camera" | "location" | "motion", PermState> {
  return { camera: s.camera ?? "pending", location: s.location ?? "pending", motion: s.motion ?? "pending" };
}

function ArSession({
  focusPinId,
  preferPinId,
  insetsTop,
  insetsBottom,
  c,
  rc,
}: {
  focusPinId?: string;
  preferPinId?: string;
  insetsTop: number;
  insetsBottom: number;
  c: ReturnType<typeof useColors>["c"];
  rc: ReturnType<typeof useColors>["rarity"];
}) {
  const { fix } = useGeolocation();
  // Only once location is allowed (a fix implies it) — iOS rejects the heading watch before that.
  const { heading } = useHeading(fix != null);
  // AR only ever places pins within 200 m: the nearby circle is plenty (and
  // it's the same area the map loads first, so it's usually already cached).
  const { pins: discovery } = useDiscoveryPins(pinArea(fix));
  const { data: focusPin } = usePinQuery(focusPinId ?? null);
  const collect = useCollectPin();
  const feedback = useFeedback();
  const requireAuth = useSession((s) => s.requireAuth);

  const [tracking, setTracking] = useState(false);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const poseRef = useRef<Pose | null>(null);
  const lastPoseUpdate = useRef(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState<ArPin | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Same rule as the web: only what you can take now, or the one ?pin=.
  // Everything that can be in the scene right now (look-ups for placed pins).
  const pool = useMemo(() => {
    if (focusPinId) return focusPin ? [focusPin] : [];
    return discovery.filter((p) => !p.locked && !p.collected);
  }, [discovery, focusPinId, focusPin]);

  // Which pins to place when calibrating: those within AR_VISIBLE_RADIUS_M,
  // nearest first, at most MAX_PINS (a performance cap). `?pin=` view mode
  // shows its one pin regardless of distance.
  const pins = useMemo(() => {
    if (focusPinId) return focusPin ? [focusPin] : [];
    if (!fix) return [];
    return discovery
      .filter((p) => !p.locked && !p.collected)
      .map((p) => ({ p, d: distanceMeters(fix, p) }))
      .filter(({ d }) => d <= AR_VISIBLE_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_PINS)
      .map(({ p }) => p);
  }, [discovery, focusPinId, focusPin, fix]);

  const onCamera = useCallback((t: ViroCameraTransform) => {
    const p = { position: t.position as number[], forward: t.forward as number[] };
    poseRef.current = p;
    const now = Date.now();
    if (now - lastPoseUpdate.current > 100) {
      lastPoseUpdate.current = now;
      setPose(p);
    }
  }, []);

  // ── Setup ──
  // Place pins as soon as tracking is normal and we have a fix + compass (no
  // extra settle wait — that only made AR slower to show anything).
  //
  // The set of pins is frozen at that moment: re-sorting the nearest 25 on
  // every GPS update (and on background refetches) swapped pins in and out
  // as you walked. A pin now only leaves the scene once it's no longer
  // capturable (e.g. you took it); Recalibrate picks up a fresh set.
  const [scenePinIds, setScenePinIds] = useState<string[] | null>(null);
  const doCalibrate = useCallback(() => {
    const p = poseRef.current;
    if (!p || !fix || heading == null) return false;
    setCal(calibrate(fix, p.position, p.forward, heading));
    setScenePinIds(pins.map((pin) => pin.id));
    return true;
  }, [fix, heading, pins]);
  useEffect(() => {
    if (!cal && tracking) doCalibrate();
  }, [cal, tracking, doCalibrate]);

  // Each pin's position AND size are fixed when it's placed. Size used to
  // follow your live distance, so it (and the card above it) changed in steps
  // as you moved — the pins looked like they were jumping.
  const placed: PlacedPin[] = useMemo(() => {
    if (!cal || !fix || !scenePinIds) return [];
    const byId = new Map(pool.map((pin) => [pin.id, pin]));
    const origin = [cal.origin.x, cal.origin.y, cal.origin.z];
    return scenePinIds.flatMap((id) => {
      const pin = byId.get(id);
      if (!pin) return [];
      const real = distanceMeters(fix, pin);
      const target = focusPinId ? viewOnlyTarget(cal.fix, pin) : pin;
      const position = placeInScene(cal, target);
      const range = Math.hypot(position[0] - (origin[0] ?? 0), position[2] - (origin[2] ?? 0));
      const capturable = isCapturable(pin);
      return {
        pin,
        position,
        scale: Math.round(legibilityScale(range, AR_CAPTURE_RADIUS) * 4) / 4,
        distance: real,
        capturable,
        reason: capturable ? null : pin.lockReason,
      };
    });
  }, [cal, fix, pool, focusPinId, scenePinIds]);

  // Aim → focus, with the web's dwell timings.
  const aimed = useMemo(() => {
    if (!pose) return null;
    let best: { id: string; angle: number } | null = null;
    for (const p of placed) {
      const range = Math.hypot(p.position[0] - (pose.position[0] ?? 0), p.position[2] - (pose.position[2] ?? 0)) || 1;
      const cone = Math.max(6, (Math.atan((PIN_RADIUS_M * p.scale * PIN_SIZE * 1.3) / range) * 180) / Math.PI);
      const angle = aimAngle(pose.position, pose.forward, p.position);
      if (angle <= cone && (!best || angle < best.angle || p.pin.id === preferPinId)) best = { id: p.pin.id, angle };
    }
    return best?.id ?? null;
  }, [placed, pose, preferPinId]);

  useEffect(() => {
    if (aimed === focusedId) return;
    const id = setTimeout(() => setFocusedId(aimed), aimed ? FOCUS_OPEN_MS : FOCUS_CLOSE_MS);
    return () => clearTimeout(id);
  }, [aimed, focusedId]);

  const target = placed.find((p) => p.pin.id === focusedId) ?? null;
  const inRange = target ? target.distance <= AR_CAPTURE_RADIUS || Boolean(focusPinId && target.pin.collected) : false;
  const armed = Boolean(target?.capturable && target.distance <= AR_CAPTURE_RADIUS);

  // Feedback whenever a pin takes the focus: the stronger "in range" cue if
  // it can be captured right now, otherwise the soft "aimed at it" tick.
  // Also when the focused pin *becomes* capturable (you walked into range).
  const lastFocused = useRef<string | null>(null);
  const lastArmed = useRef(false);
  useEffect(() => {
    const newFocus = focusedId !== null && focusedId !== lastFocused.current;
    if (newFocus) {
      if (armed) feedback.cameIntoRange();
      else feedback.focused();
    } else if (focusedId && armed && !lastArmed.current) {
      feedback.cameIntoRange();
    }
    lastFocused.current = focusedId;
    lastArmed.current = armed;
  }, [focusedId, armed, feedback]);

  useEffect(() => {
    if (!captureError) return;
    const id = setTimeout(() => setCaptureError(null), 5000);
    return () => clearTimeout(id);
  }, [captureError]);

  const capture = useCallback(
    (pin: ArPin) => {
      const run = () => {
        if (!fix) {
          setCaptureError("Waiting for a location fix before capturing.");
          return;
        }
        setCaptureError(null);
        collect.mutate(
          { id: pin.id, lat: fix.lat, lng: fix.lng },
          {
            onSuccess: () => {
              feedback.captured(pin.rarity);
              setCelebrating(pin);
            },
            onError: (err) => setCaptureError(err.message),
          },
        );
      };
      if (!requireAuth("ar", run)) return;
      run();
    },
    [fix, collect, feedback, requireAuth],
  );

  const viroProps: ArWorldProps = { placed, focusedId, onCamera, onTracking: setTracking, onPinTap: setFocusedId };
  const camYaw = pose ? yawFromForward(pose.forward) : null;
  const compassHeading = cal && camYaw != null ? (camYaw + cal.sceneNorthOffset) % 360 : heading;
  const hudItems = pose
    ? placed.map((p) => ({ id: p.pin.id, yaw: relativeYaw(pose.position, pose.forward, p.position), distance: p.distance, capturable: p.capturable, focused: p.pin.id === focusedId, color: rc(p.pin.rarity) }))
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <ViroARSceneNavigator style={StyleSheet.absoluteFill} autofocus worldAlignment="Gravity" initialScene={{ scene: ArWorld as never }} viroAppProps={viroProps} />

      <Reticle locked={Boolean(target)} armed={armed} />
      {cal && <EdgeArrows items={hudItems.filter((i) => i.id !== focusedId)} />}
      <CompassStrip heading={compassHeading} top={insetsTop + 64} />

      <View pointerEvents="box-none" style={{ position: "absolute", top: insetsTop + 14, left: 16, right: 16, flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", zIndex: 30 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/map"))} accessibilityLabel="Leave AR">
          <Glass style={{ height: 36, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 6, paddingRight: 12 }}>
            <ChevronLeft size={17} strokeWidth={2.4} color={c("ar-text-dim")} />
            <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.4px] text-ar-dim">Exit</Text>
          </Glass>
        </Pressable>
        <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }} pointerEvents="box-none">
          <CameraModeSwitch mode="ar" />
        </View>
        <Radar items={hudItems} />
      </View>

      {/* Status: finding bearings / nothing nearby / recalibrate. */}
      <View pointerEvents="box-none" style={{ position: "absolute", top: insetsTop + 100, left: 0, right: 0, alignItems: "center", zIndex: 25 }}>
        {!cal ? (
          <Glass style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
            <Text className="font-hud text-[10.5px] font-semibold uppercase tracking-[1.4px] text-ar-dim">
              {!fix ? "Finding your location…" : heading == null ? "Waiting for the compass…" : "Hold still — finding your bearings"}
            </Text>
          </Glass>
        ) : placed.length === 0 ? (
          <Glass style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, maxWidth: "84%" }}>
            <Text className="font-hud text-center text-[11px] font-semibold uppercase tracking-[1.3px] text-ar-dim">Nothing within {AR_VISIBLE_RADIUS_M} m</Text>
            <Text className="mt-1 text-center text-[11.5px] text-ar-faint">Head toward a pin on the map — it shows up here within {AR_VISIBLE_RADIUS_M} m, and you can capture it within {AR_CAPTURE_RADIUS} m.</Text>
          </Glass>
        ) : (
          <Pressable onPress={() => doCalibrate()} accessibilityLabel="Recalibrate direction">
            <Glass style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Crosshair size={12} strokeWidth={2.4} color={c("ar-text-faint")} />
              <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.3px] text-ar-faint">Pins off? Face one and tap to recalibrate</Text>
            </Glass>
          </Pressable>
        )}
      </View>

      {captureError && (
        <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={{ position: "absolute", top: insetsTop + 140, left: 0, right: 0, alignItems: "center", zIndex: 50 }}>
          <Glass style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, maxWidth: "86%" }}>
            <Text className="font-hud text-center text-[11px] font-semibold leading-5 text-ar-danger">{captureError}</Text>
          </Glass>
        </Animated.View>
      )}

      {/* Bottom action — just the action; the card beside the coin says the rest. */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(20, insetsBottom + 8), zIndex: 30 }}>
        {target && (
          <Animated.View key={target.pin.id} entering={FadeInDown.springify().stiffness(420).damping(32)} exiting={FadeOutDown} style={{ alignSelf: "center", width: "100%", maxWidth: 304 }}>
            {armed ? (
              <CollectButton title={target.pin.title} busy={collect.isPending} onPress={() => capture(target.pin)} />
            ) : (
              <Glass style={{ borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" }}>
                <Text className="font-hud text-[12px] font-bold uppercase tracking-[1.3px] text-ar-text" numberOfLines={1}>
                  {target.pin.title}
                </Text>
                <Text className="mt-1 text-[11.5px] text-ar-faint">
                  {target.capturable
                    ? inRange
                      ? "Hold steady…"
                      : `${formatDistance(target.distance)} away — walk closer to capture`
                    : (target.reason ?? (target.pin.collected ? "Already in your collection" : "Not available"))}
                </Text>
              </Glass>
            )}
          </Animated.View>
        )}
      </View>

      {celebrating && (
        <CollectCelebration
          pin={celebrating}
          onDone={() => {
            const id = celebrating.id;
            setCelebrating(null);
            router.replace(`/collection/${id}`);
          }}
        />
      )}
    </View>
  );
}
