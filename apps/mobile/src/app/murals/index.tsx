import { useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { DeviceMotion } from "expo-sensors";
import { Camera as CameraIcon, Coins, Download, Frame, MapPin, RotateCcw, X, type LucideIcon } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, FadeOut, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, usePhotoOutput } from "react-native-vision-camera";

import { CameraModeSwitch } from "~/components/ar/CameraModeSwitch";
import { NameMuralSheet } from "~/components/murals/NameMuralSheet";
import { MuralOutline } from "~/components/murals/MuralOutline";
import { PackPanel } from "~/components/murals/PackPanel";
import { failedCheck, MuralViewfinder, ScanVerifying, SweepGauge } from "~/components/murals/ScanParts";
import { EdgeChevrons, GhostPhone } from "~/components/murals/TurnGuide";
import { ScanResult } from "~/components/murals/ScanResult";
import { ArButton } from "~/components/ui/ArButton";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useFeedback } from "~/lib/ar/feedback";
import { useGeolocation } from "~/lib/ar/location";
import { useSession } from "~/lib/auth/session";
import { useCoinBalance, useNearbyMurals, useSubmitMuralScan } from "~/lib/murals/api";
import { MAX_GPS_ACCURACY_M, SWEEP_SIDE_DEG, type ScanResult as Result } from "~/lib/murals/constants";
import type { Outline } from "~/lib/murals/localize";
import { startMuralPack, useMuralPack, verifyMuralPack, type PackState } from "~/lib/murals/pack";
import { sfx } from "~/lib/murals/sfx";
import { useMuralDetector } from "~/lib/murals/useMuralDetector";
import { useMuralSweep, type SweepSlot } from "~/lib/murals/useMuralSweep";
import { useColors } from "~/theme/theme";

/**
 * ── /murals ────────────────────────────────────────────────────────────────
 *
 * Native Murals camera — same five phases and copy as wadzzoAR's web screen
 * (docs/murals/plan.md §6): searching → locked → sweeping → sending → result.
 * VisionCamera 5 feeds both the on-device detector (frame output) and the
 * three keyframes (photo output, ~1024 px JPEG). Viro never runs here.
 */

type Phase = "searching" | "locked" | "sweeping" | "sending" | "result";

const LOCK_BEAT_MS = 700;
/** Module-level: the photo output memoises on this object's identity. */
const PHOTO_SIZE = { width: 768, height: 1024 };

export default function MuralsScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { target: targetId } = useLocalSearchParams<{ target?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const { fix, status: geoStatus } = useGeolocation();
  const signedIn = useSession((s) => Boolean(s.user));
  const requireAuth = useSession((s) => s.requireAuth);
  const feedback = useFeedback();

  const [phase, setPhase] = useState<Phase>("searching");
  // Phase changes come from events (lock flips, captures, the server); the
  // callbacks read the current phase through this ref.
  const phaseRef = useRef<Phase>("searching");
  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const [toast, setToast] = useState<string | null>(null);
  const live = phase === "searching" || phase === "locked" || phase === "sweeping";

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
    // iOS asks for motion separately; harmless elsewhere.
    void DeviceMotion.requestPermissionsAsync().catch(() => undefined);
  }, [permission, requestPermission]);

  const nearby = useNearbyMurals(fix);
  const balance = useCoinBalance(signedIn);
  const submit = useSubmitMuralScan();
  const target = targetId ? nearby.murals.find((m) => m.id === targetId) : undefined;

  const [match, setMatch] = useState<ReturnType<typeof nearby.matchVector>>(null);
  const atLimit = match != null && nearby.dailyLimit != null && match.scansToday >= nearby.dailyLimit;
  const [result, setResult] = useState<Result | null>(null);
  const [outcome, setOutcome] = useState<null | "ok" | { failed: number | null }>(null);
  const [naming, setNaming] = useState(false);

  // ── Keyframes ───────────────────────────────────────────────────────────
  const [files, setFiles] = useState<(string | null)[]>([null, null, null]);
  const filesRef = useRef<(string | null)[]>([null, null, null]);
  const clearFiles = useCallback(() => {
    filesRef.current = [null, null, null];
    setFiles([null, null, null]);
  }, []);
  const sweepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (sweepTimer.current && clearTimeout(sweepTimer.current)), []);

  const photoOutput = usePhotoOutput({ targetResolution: PHOTO_SIZE, containerFormat: "jpeg", quality: 0.8, qualityPrioritization: "speed" });

  // Declared before use by the capture callback; reads the latest values.
  const latest = useRef({ fix, sweepResult: () => ({ spanDeg: 0, durationMs: 0 }) });

  const send = useCallback(() => {
    const f = latest.current.fix;
    if (!f) {
      setToast("Waiting for your location…");
      return;
    }
    go("sending");
    setOutcome(null);
    void submit
      .run({ files: filesRef.current as [string, string, string], fix: f, sweep: latest.current.sweepResult() })
      .catch((e: unknown) => ({
        kind: "rejected" as const,
        code: "SESSION_EXPIRED" as const,
        message: e instanceof Error ? e.message : "Something went wrong — try again",
        retryable: true,
      }))
      .then((r) => {
        setOutcome(r.kind === "rejected" ? { failed: failedCheck(r.code) } : "ok");
        if (r.kind !== "rejected") feedback.captured(r.kind === "discovered" ? "legendary" : "epic");
        // Let the last tick land before the card swaps.
        setTimeout(() => {
          setResult(r);
          go("result");
        }, 650);
      });
  }, [feedback, go, submit]);

  const onCapture = useCallback(
    (slot: SweepSlot) => {
      sfx.capture();
      void photoOutput
        .capturePhotoToFile({ flashMode: "off", enableShutterSound: false }, {})
        .then(({ filePath }) => {
          if (phaseRef.current !== "sweeping") return;
          filesRef.current = filesRef.current.map((f, i) => (i === slot ? `file://${filePath}` : f));
          setFiles(filesRef.current);
          // The centre frame is the last stop; once all three are in, send.
          if (filesRef.current.every(Boolean)) send();
        })
        .catch(() => setToast("Couldn't take that photo — try again"));
    },
    [photoOutput, send],
  );
  const sweep = useMuralSweep({ active: phase === "sweeping", onCapture });
  const captured = files.map(Boolean) as [boolean, boolean, boolean];
  useEffect(() => {
    latest.current = { fix, sweepResult: sweep.result };
  });

  // ── Lock flips drive the flow ───────────────────────────────────────────
  const detectorRef = useRef<{ lastVector: { current: number[] | null }; outline: Outline | null } | null>(null);
  const [sweepOutline, setSweepOutline] = useState<Outline | null>(null);
  const onLockChange = useCallback(
    (locked: boolean) => {
      const p = phaseRef.current;
      if (locked && p === "searching") {
        const m = nearby.matchVector(detectorRef.current?.lastVector.current ?? null);
        setMatch(m);
        sfx.lock();
        go("locked");
        const limited = m != null && nearby.dailyLimit != null && m.scansToday >= nearby.dailyLimit;
        if (limited) return;
        const startSweep = () => {
          sweepTimer.current = setTimeout(() => {
            if (phaseRef.current !== "locked") return;
            // The outline freezes here and slides with the turn.
            setSweepOutline(detectorRef.current?.outline ?? null);
            go("sweeping");
          }, LOCK_BEAT_MS);
        };
        // Signed out: the sheet opens; signing in picks the flow back up.
        if (!signedIn) {
          requireAuth("murals", startSweep);
          return;
        }
        startSweep();
      } else if (!locked && p === "locked") {
        go("searching");
      } else if (!locked && p === "sweeping") {
        // Lost the mural mid-sweep: start over rather than send half a scan.
        clearFiles();
        setToast("Lost the mural — point back at it");
        go("searching");
      }
    },
    [clearFiles, go, nearby, requireAuth, signedIn],
  );

  // ── Mural pack gate ─────────────────────────────────────────────────────
  // The camera opens straight away; detection waits until the pack is
  // installed AND passes an integrity check for this camera session.
  const [integrity, setIntegrity] = useState<"pending" | "checking" | "ok" | "failed">("pending");
  const integrityRef = useRef(integrity);
  useEffect(() => {
    void startMuralPack();
    const onPack = (st: PackState) => {
      if (st.status === "ready" && integrityRef.current === "pending") {
        integrityRef.current = "checking";
        setIntegrity("checking");
        void verifyMuralPack().then((r) => {
          integrityRef.current = r === "ok" ? "ok" : "failed";
          setIntegrity(integrityRef.current);
        });
      } else if (st.status === "downloading" && integrityRef.current === "failed") {
        // It's repairing itself; check again when it's back.
        integrityRef.current = "pending";
        setIntegrity("pending");
      }
    };
    void Promise.resolve().then(() => onPack(useMuralPack.getState()));
    return useMuralPack.subscribe(onPack);
  }, []);
  const packOk = integrity === "ok";

  const detector = useMuralDetector({ enabled: live && Boolean(permission?.granted) && packOk, onLockChange });

  // Sweep feedback: the outline slides with the turn; a haptic tick per 3°.
  const offsetX = useSharedValue(0);
  const pxPerDeg = width / 55; // portrait rear cameras see ~55° across
  const lastTick = useRef(0);
  useEffect(() => {
    offsetX.set(phase === "sweeping" ? -sweep.delta * pxPerDeg : 0);
    if (phase !== "sweeping") return;
    const bucket = Math.trunc(sweep.delta / 3);
    if (bucket !== lastTick.current) {
      lastTick.current = bucket;
      sfx.tick();
    }
  }, [phase, sweep.delta, pxPerDeg, offsetX]);
  useEffect(() => {
    detectorRef.current = detector;
  });
  const outputs = useMemo(() => [detector.frameOutput, photoOutput], [detector.frameOutput, photoOutput]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const restart = useCallback(() => {
    clearFiles();
    setResult(null);
    setMatch(null);
    setOutcome(null);
    detector.reset();
    go("searching");
  }, [clearFiles, detector, go]);

  // ── Guidance ────────────────────────────────────────────────────────────
  const roughGps = fix != null && fix.accuracy > MAX_GPS_ACCURACY_M;
  const { title, sub, Icon } = ((): { title: string; sub: string | null; Icon: LucideIcon } => {
    if (!packOk) {
      if (integrity === "checking") return { title: "Checking the mural pack…", sub: "Making sure every file is intact.", Icon: Download };
      if (integrity === "failed") return { title: "Mural pack damaged", sub: "Repairing it now — scanning unlocks when it's fixed.", Icon: Download };
      return { title: "Mural pack needed", sub: null, Icon: Download };
    }
    if (detector.state === "loading") return { title: "Starting the mural finder…", sub: "One moment.", Icon: Download };
    if (detector.state === "error") return { title: "Couldn't start the mural finder", sub: "Try again, or repair the pack in Profile › Downloads.", Icon: Frame };
    if (!fix) {
      return geoStatus === "denied"
        ? { title: "Location is off", sub: "Murals need your location — allow it in Settings.", Icon: MapPin }
        : { title: "Finding your location…", sub: "Hold on a moment.", Icon: MapPin };
    }
    if (phase === "searching") {
      if (detector.quality === "dark") return { title: "Too dark", sub: "Find more light, or move closer.", Icon: Frame };
      if (detector.quality === "blurry") return { title: "Hold steady", sub: "Give the camera a second to focus.", Icon: Frame };
      if (detector.score >= 0.25) return { title: "Hold it there…", sub: null, Icon: Frame };
      if (target) return { title: `Point at “${target.title}”`, sub: "Fill the frame with it.", Icon: Frame };
      return { title: "Point at a mural or street art", sub: "Murals, graffiti, painted walls — fill the frame with it.", Icon: Frame };
    }
    if (phase === "locked") {
      if (!signedIn) return { title: "Mural found", sub: "Sign in to collect it and earn Wadzzo Coins.", Icon: Frame };
      if (atLimit && match) return { title: `${match.title} · ${match.scansToday}/${nearby.dailyLimit} today`, sub: "Come back after midnight to scan it again.", Icon: Frame };
      return match ? { title: match.title, sub: "Get ready to turn", Icon: Frame } : { title: "Mural found", sub: "Looks new — let's check it", Icon: Frame };
    }
    const turn = sweep.tooFast ? "A little slower" : sweep.step === "left" ? "Slowly turn left" : sweep.step === "right" ? "Now turn right" : "Back to the middle";
    return { title: turn, sub: "Keep the mural in view.", Icon: Frame };
  })();

  // ── Camera permission ───────────────────────────────────────────────────
  if (permission && !permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: c("ar-void"), justifyContent: "center", padding: 28 }}>
        <Glass style={{ borderRadius: 22, padding: 22, alignItems: "center" }}>
          <CameraIcon size={28} strokeWidth={1.8} color={c("rarity-epic")} />
          <Text className="font-hud mt-3 text-[18px] font-bold text-ar-text">Scan street art</Text>
          <Text className="mt-1.5 text-center text-[12.5px] leading-[19px] text-ar-dim">
            The camera spots murals and graffiti. It stays on your phone until you finish a scan — then 3 photos are sent to verify it.
          </Text>
          <View style={{ alignSelf: "stretch", marginTop: 16, gap: 8 }}>
            <ArButton variant="primary" size="lg" icon={CameraIcon} onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}>
              {permission.canAskAgain ? "Allow camera" : "Open Settings"}
            </ArButton>
            <ArButton variant="ghost" size="md" onPress={() => router.back()}>
              Back
            </ArButton>
          </View>
        </Glass>
      </View>
    );
  }

  const nearbyCount = nearby.murals.length;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {permission?.granted && (
        <Camera style={StyleSheet.absoluteFill} device="back" isActive={live} outputs={outputs} onError={() => setToast("Camera error — close and reopen Murals")} />
      )}

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.12)" }]} />
      {live && (
        <>
          {!(phase === "sweeping" ? sweepOutline : detector.outline) && (
            <MuralViewfinder state={phase === "sweeping" ? "sweeping" : phase === "locked" ? "locked" : detector.state === "ready" ? "searching" : "idle"} score={detector.score} />
          )}
          <MuralOutline
            outline={phase === "sweeping" ? sweepOutline : detector.outline}
            aspect={detector.frameAspect}
            mode={phase === "sweeping" ? "sweeping" : phase === "locked" ? "locked" : "acquiring"}
            kind={detector.kind}
            score={detector.score}
            offsetX={offsetX}
            targetOffsetX={phase !== "sweeping" ? null : sweep.step === "left" ? SWEEP_SIDE_DEG * pxPerDeg : sweep.step === "right" ? -SWEEP_SIDE_DEG * pxPerDeg : sweep.step === "centre" ? 0 : null}
          />
          {phase === "sweeping" && <EdgeChevrons step={sweep.step} />}
        </>
      )}

      {/* ── Top chrome ─────────────────────────────────────────────── */}
      <View style={{ position: "absolute", top: insets.top + 10, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {signedIn ? (
          <Pressable onPress={() => router.push("/coins")} accessibilityLabel="Wadzzo Coins balance">
            <Glass style={{ height: 36, borderRadius: 18, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Coins size={14} strokeWidth={2.5} color={c("rarity-legendary")} />
              <Text className="font-hud text-[12px] font-bold" style={{ color: c("rarity-legendary") }}>
                {(balance.data?.balance ?? 0).toLocaleString()}
              </Text>
            </Glass>
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <CameraModeSwitch mode="murals" />
        <Pressable onPress={() => router.back()} accessibilityLabel="Close camera" hitSlop={8}>
          <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
            <X size={17} strokeWidth={2.4} color={c("ar-text")} />
          </Glass>
        </Pressable>
      </View>

      {live && (nearbyCount > 0 || roughGps) && (
        <View style={{ position: "absolute", top: insets.top + 56, alignSelf: "center" }}>
          <Glass style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MapPin size={11} strokeWidth={2.6} color={roughGps ? c("rarity-legendary") : c("rarity-epic")} />
            <Text className="font-hud text-[10.5px] font-bold uppercase tracking-[1.4px] text-ar-dim">
              {roughGps ? `Location rough · ±${Math.round(fix.accuracy)} m` : `${nearbyCount} mural${nearbyCount === 1 ? "" : "s"} nearby`}
            </Text>
          </Glass>
        </View>
      )}

      {/* ── Guidance ───────────────────────────────────────────────── */}
      {live && (
        <View style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(22, insets.bottom + 8) }}>
          {toast && (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={{ alignSelf: "center", marginBottom: 8, borderRadius: 999, backgroundColor: "rgba(10,18,14,0.85)", paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text className="text-[11.5px] text-white">{toast}</Text>
            </Animated.View>
          )}
          <Glass style={{ borderRadius: 22, padding: 16, alignItems: "center" }}>
            {!packOk ? (
              <View style={{ alignSelf: "stretch", marginBottom: 8 }}>
                <PackPanel compact />
              </View>
            ) : phase === "sweeping" ? (
              <>
                <GhostPhone step={sweep.step} />
                <SweepGauge delta={sweep.delta} step={sweep.step} captured={captured} />
              </>
            ) : (
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  marginBottom: 8,
                  borderWidth: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderColor: phase === "locked" ? c("rarity-epic", 0.6) : c("ar-text", 0.2),
                  backgroundColor: phase === "locked" ? c("rarity-epic", 0.2) : c("ar-text", 0.06),
                }}
              >
                <Icon size={17} strokeWidth={2.3} color={phase === "locked" ? c("rarity-epic") : c("ar-text-dim")} />
              </View>
            )}
            <Text className="font-hud mt-1 text-center text-[13px] font-bold uppercase tracking-[1.5px] text-ar-text" accessibilityLiveRegion="polite">
              {title}
            </Text>
            {sub && <Text className="mt-1.5 text-center text-[11.5px] leading-[17px] text-ar-dim">{sub}</Text>}
            {phase === "locked" && !signedIn && (
              <View style={{ alignSelf: "stretch", marginTop: 12 }}>
                <ArButton variant="primary" size="md" onPress={() => requireAuth("murals")}>
                  Sign in to collect
                </ArButton>
              </View>
            )}
            {detector.state === "error" && (
              <View style={{ alignSelf: "stretch", marginTop: 12 }}>
                <ArButton variant="primary" size="md" icon={RotateCcw} onPress={() => router.replace("/murals")}>
                  Try again
                </ArButton>
              </View>
            )}
          </Glass>
        </View>
      )}

      {/* ── Sending / result ───────────────────────────────────────── */}
      {(phase === "sending" || phase === "result") && (
        <Animated.View entering={FadeIn} style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,18,14,0.82)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }]}>
          {phase === "sending" && <ScanVerifying frames={files.filter((f): f is string => Boolean(f))} outcome={outcome} />}
          {phase === "result" && result && (
            <ScanResult result={result} photo={files[1] ?? null} onDone={() => router.replace("/map")} onRetry={restart} onName={() => setNaming(true)} />
          )}
        </Animated.View>
      )}

      {result && result.kind !== "rejected" && (
        <NameMuralSheet
          key={naming ? "open" : "closed"}
          muralId={result.mural.id}
          autoTitle={result.mural.title}
          open={naming}
          onClose={() => {
            setNaming(false);
            router.replace("/map");
          }}
        />
      )}
    </View>
  );
}
