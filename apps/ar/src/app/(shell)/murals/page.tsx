"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Coins, Download, Frame, Hand, MapPin, RotateCcw, X, type LucideIcon } from "lucide-react";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArPermissionGate, type GateCopy, type PermState } from "~/components/ar/ArPermissionGate";
import { CameraModeSwitch } from "~/components/ar/CameraModeSwitch";
import { MuralOutline } from "~/components/murals/MuralOutline";
import { MuralViewfinder } from "~/components/murals/MuralViewfinder";
import { PackPanel } from "~/components/murals/PackPanel";
import { NameMuralSheet } from "~/components/murals/NameMuralSheet";
import { ScanResult } from "~/components/murals/ScanResult";
import { failedCheck, ScanVerifying } from "~/components/murals/ScanVerifying";
import { SweepGauge } from "~/components/murals/SweepGauge";
import { EdgeChevrons, GhostPhone } from "~/components/murals/TurnGuide";
import { AppShell } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { useFeedback } from "~/lib/ar/feedback";
import { useAuth } from "~/lib/ar/store";
import { useCamera } from "~/lib/ar/useCamera";
import { useDeviceHeading } from "~/lib/ar/useDeviceHeading";
import { useGeolocation } from "~/lib/ar/useGeolocation";
import {
  MAX_GPS_ACCURACY_M,
  SWEEP_SIDE_DEG,
  type ScanResult as Result,
} from "~/lib/murals/constants";
import type { Outline } from "~/lib/murals/localize";
import { startMuralPack, useMuralPack, verifyMuralPack } from "~/lib/murals/pack";
import { sfx } from "~/lib/murals/sfx";
import { captureKeyframe, useMuralDetector } from "~/lib/murals/useMuralDetector";
import { useCoinBalance, useNearbyMurals, useSubmitMuralScan } from "~/lib/murals/useMurals";
import { useMuralSweep, type SweepSlot } from "~/lib/murals/useMuralSweep";
import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── /murals ────────────────────────────────────────────────────────────────
 *
 * The Murals camera (docs/murals/plan.md §6). One screen, five phases:
 *
 *   gate       camera + location + motion, one tap (iOS needs the gesture)
 *   searching  MobileCLIP on the live view; guidance reacts to light, blur,
 *              confidence; a pre-match names a known mural before the sweep
 *   sweeping   turn left → right → back; a keyframe at each stop
 *   sending    upload + server checks; the three ticks
 *   result     coins / discovery / the reason it didn't count
 *
 * Detection is free and works signed out. Collecting needs an account, so the
 * sign-in prompt appears at the moment of the lock — when there's something
 * worth signing in for.
 */

type Phase = "gate" | "searching" | "locked" | "sweeping" | "sending" | "result";

const GATE: GateCopy = {
  mode: "murals",
  title: "Scan street art",
  body: `Point at a mural or graffiti, turn a little left and right, earn ${platformBranding.coinName}.`,
  why: {
    camera: "Spots murals and graffiti in the live view.",
    location: "Ties your scan to the wall it's painted on.",
    motion: "Confirms the short left/right turn.",
  },
  unsupported: {
    camera: `No camera found — open ${platformBranding.name} on your phone to scan murals.`,
    location: `No location on this device — open ${platformBranding.name} on your phone to scan murals.`,
    motion: "No motion sensor — the left/right check needs a phone.",
  },
  cta: "Allow & start scanning",
  footnote:
    "The camera stays on your phone until you finish a scan — then 3 photos are sent to verify it.",
};

/** Hold the "Mural found" moment before the sweep starts. */
const LOCK_BEAT_MS = 700;

export default function MuralsScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const [phase, setPhase] = useState<Phase>("gate");
  /** Opened from a map sheet: `?target=<muralId>`. */
  const targetId = typeof urlQuery.target === "string" ? urlQuery.target : null;
  const [requesting, setRequesting] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const signedIn = useAuth((s) => Boolean(s.user));
  const requireAuth = useAuth((s) => s.requireAuth);
  const feedback = useFeedback();

  const camera = useCamera({ enabled: phase !== "gate" });
  const { fix, status: geoStatus } = useGeolocation();
  const compass = useDeviceHeading();

  const live = phase === "searching" || phase === "locked" || phase === "sweeping";
  // ── Mural pack gate ─────────────────────────────────────────────────────
  // The camera opens straight away; detection waits until the pack is
  // installed AND passes an integrity check for this session.
  const pack = useMuralPack();
  const [integrity, setIntegrity] = useState<"pending" | "checking" | "ok" | "failed">("pending");
  useEffect(() => {
    if (phase === "gate") return;
    void startMuralPack();
  }, [phase]);
  useEffect(() => {
    if (phase === "gate" || pack.status !== "ready" || integrity !== "pending") return;
    setIntegrity("checking");
    void verifyMuralPack().then((r) => setIntegrity(r === "ok" ? "ok" : "failed"));
  }, [phase, pack.status, integrity]);
  // A failed check repairs itself (the pack re-downloads); re-check after.
  useEffect(() => {
    if (integrity === "failed" && pack.status === "downloading") setIntegrity("pending");
  }, [integrity, pack.status]);
  const packOk = integrity === "ok";

  // Only while looking: the model stays loaded, the loop pauses while sending.
  const detector = useMuralDetector({
    video: camera.videoNode,
    enabled: live && packOk,
  });
  const nearby = useNearbyMurals(fix);
  const target = targetId ? nearby.murals.find((m) => m.id === targetId) : undefined;
  const balance = useCoinBalance(signedIn);
  const submit = useSubmitMuralScan();

  // ── Keyframes ───────────────────────────────────────────────────────────
  const blobs = useRef<(Blob | null)[]>([null, null, null]);
  const [frameUrls, setFrameUrls] = useState<(string | null)[]>([null, null, null]);
  const clearFrames = useCallback(() => {
    blobs.current = [null, null, null];
    setFrameUrls((prev) => {
      prev.forEach((u) => u && URL.revokeObjectURL(u));
      return [null, null, null];
    });
  }, []);
  useEffect(() => clearFrames, [clearFrames]);

  const onCapture = useCallback(
    (slot: SweepSlot) => {
      const video = camera.videoNode;
      if (!video) return;
      sfx.capture();
      void captureKeyframe(video).then((blob) => {
        blobs.current[slot] = blob;
        const url = URL.createObjectURL(blob);
        setFrameUrls((prev) => prev.map((u, i) => (i === slot ? url : u)));
      });
    },
    [camera.videoNode],
  );

  const sweep = useMuralSweep({
    heading: compass.heading,
    active: phase === "sweeping",
    onCapture,
  });
  const captured = frameUrls.map(Boolean) as [boolean, boolean, boolean];

  // Haptic tick every 3° of turn while sweeping.
  const lastTick = useRef(0);
  useEffect(() => {
    if (phase !== "sweeping") return;
    const bucket = Math.trunc(sweep.delta / 3);
    if (bucket !== lastTick.current) {
      lastTick.current = bucket;
      sfx.tick();
    }
  }, [phase, sweep.delta]);

  // The outline freezes at the start of the sweep and slides with the turn.
  const [sweepOutline, setSweepOutline] = useState<Outline | null>(null);
  useEffect(() => {
    if (phase === "sweeping") setSweepOutline((o) => o ?? detector.outline);
    else setSweepOutline(null);
  }, [phase, detector.outline]);
  const screenRef = useRef<HTMLDivElement>(null);
  // Portrait rear cameras see roughly 55° across.
  const pxPerDeg = (screenRef.current?.clientWidth ?? 390) / 55;

  // ── Pre-match at the moment of lock (UX only; the server decides) ───────
  const [match, setMatch] = useState<ReturnType<typeof nearby.matchVector>>(null);
  const atLimit = match != null && match.scansToday >= (nearby.dailyLimit ?? Infinity);

  // ── Phase transitions ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "searching" && detector.locked) {
      setMatch(nearby.matchVector(detector.lastVector.current));
      sfx.lock();
      setPhase("locked");
    }
  }, [phase, detector.locked, detector.lastVector, nearby]);

  useEffect(() => {
    if (phase !== "locked") return;
    if (!detector.locked) {
      setPhase("searching");
      return;
    }
    if (!signedIn) {
      requireAuth("murals");
      return;
    }
    if (atLimit) return;
    const t = setTimeout(() => setPhase("sweeping"), LOCK_BEAT_MS);
    return () => clearTimeout(t);
  }, [phase, detector.locked, signedIn, atLimit, requireAuth]);

  // Lost the mural mid-sweep: start over rather than send half a scan.
  useEffect(() => {
    if (phase === "sweeping" && !detector.locked) {
      clearFrames();
      setToast("Lost the mural — point back at it");
      setPhase("searching");
    }
  }, [phase, detector.locked, clearFrames]);

  const [result, setResult] = useState<Result | null>(null);
  const [verifyOutcome, setVerifyOutcome] = useState<null | "ok" | { failed: number | null }>(null);
  const [naming, setNaming] = useState(false);

  // All three keyframes in and the turn finished → send.
  useEffect(() => {
    if (phase !== "sweeping" || sweep.step !== "done" || !captured.every(Boolean) || !fix) return;
    setPhase("sending");
    setVerifyOutcome(null);
    const frames = blobs.current as [Blob, Blob, Blob];
    void submit
      .run({ frames, fix, sweep: sweep.result(), platform: "web" })
      .catch((e: unknown) => ({
        kind: "rejected" as const,
        code: "SESSION_EXPIRED" as const,
        message: e instanceof Error ? e.message : "Something went wrong — try again",
        retryable: true,
      }))
      .then((r) => {
        setVerifyOutcome(r.kind === "rejected" ? { failed: failedCheck(r.code) } : "ok");
        if (r.kind !== "rejected")
          feedback.captured(r.kind === "discovered" ? "legendary" : "epic");
        // Let the last tick land before the card swaps.
        setTimeout(() => {
          setResult(r);
          setPhase("result");
        }, 650);
      });
  }, [phase, sweep, captured, fix, submit, feedback]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3_000);
    return () => clearTimeout(t);
  }, [toast]);

  const restart = useCallback(() => {
    clearFrames();
    setResult(null);
    setMatch(null);
    setVerifyOutcome(null);
    detector.reset();
    setPhase("searching");
  }, [clearFrames, detector]);

  // ── Gate ────────────────────────────────────────────────────────────────
  const states = useMemo<Record<"camera" | "location" | "motion", PermState>>(
    () => ({
      camera:
        camera.state === "ready"
          ? "granted"
          : camera.state === "denied"
            ? "denied"
            : camera.state === "unsupported"
              ? "unsupported"
              : "pending",
      location: fix ? "granted" : geoStatus === "denied" ? "denied" : "pending",
      motion: compass.permission,
    }),
    [camera.state, fix, geoStatus, compass.permission],
  );

  // Same order and reasoning as /ar: compass inside the fresh gesture first.
  const handleRequest = useCallback(async () => {
    setRequesting(true);
    setGateError(null);
    await compass.request();
    const within = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
    const gotCamera = await within(camera.start(), 12_000);
    setRequesting(false);
    if (gotCamera === false) {
      setGateError("The camera is needed to scan murals. Allow it for this site and try again.");
      return;
    }
    setPhase("searching");
  }, [camera, compass]);

  // Desktop / no gyro: drag sideways to turn (the hook's manual mode).
  const drag = useRef<number | null>(null);
  const manual = compass.source === "manual";

  if (phase === "gate") {
    return (
      <AppShell tabs={false} bleed>
        <ArPermissionGate
          states={states}
          requesting={requesting}
          onRequest={handleRequest}
          error={gateError}
          copy={GATE}
        />
      </AppShell>
    );
  }

  // ── Guidance copy ───────────────────────────────────────────────────────
  const roughGps = fix && fix.accuracy > MAX_GPS_ACCURACY_M;
  const { title, sub, Icon } = ((): {
    title: string;
    sub: string | null;
    Icon: LucideIcon;
  } => {
    if (!packOk) {
      if (integrity === "checking")
        return {
          title: "Checking the mural pack…",
          sub: "Making sure every file is intact.",
          Icon: Download,
        };
      if (integrity === "failed")
        return {
          title: "Mural pack damaged",
          sub: "Repairing it now — scanning unlocks when it's fixed.",
          Icon: Download,
        };
      return { title: "Mural pack needed", sub: null, Icon: Download };
    }
    if (detector.state === "loading")
      return {
        title: "Starting the mural finder…",
        sub: "One moment.",
        Icon: Download,
      };
    if (detector.state === "error")
      return {
        title: "Couldn't start the mural finder",
        sub: "Reload, or repair the pack in Profile › Downloads.",
        Icon: Frame,
      };
    if (!fix) {
      return geoStatus === "denied"
        ? {
            title: "Location is off",
            sub: "Murals need your location — allow it in site settings.",
            Icon: MapPin,
          }
        : {
            title: "Finding your location…",
            sub: "Hold on a moment.",
            Icon: MapPin,
          };
    }
    if (phase === "searching") {
      if (detector.quality === "dark")
        return {
          title: "Too dark",
          sub: "Find more light, or move closer.",
          Icon: Frame,
        };
      if (detector.quality === "blurry")
        return {
          title: "Hold steady",
          sub: "Give the camera a second to focus.",
          Icon: Frame,
        };
      if (detector.score >= 0.25) return { title: "Hold it there…", sub: null, Icon: Frame };
      if (target)
        return {
          title: `Point at “${target.title}”`,
          sub: "Fill the frame with it.",
          Icon: Frame,
        };
      return {
        title: "Point at a mural or street art",
        sub: "Murals, graffiti, painted walls — fill the frame with it.",
        Icon: Frame,
      };
    }
    if (phase === "locked") {
      if (!signedIn)
        return {
          title: "Mural found",
          sub: `Sign in to collect it and earn ${platformBranding.coinName}.`,
          Icon: Frame,
        };
      if (atLimit && match) {
        return {
          title: `${match.title} · ${match.scansToday}/${nearby.dailyLimit} today`,
          sub: "Come back after midnight to scan it again.",
          Icon: Frame,
        };
      }
      return match
        ? { title: match.title, sub: "Get ready to turn", Icon: Frame }
        : {
            title: "Mural found",
            sub: "Looks new — let's check it",
            Icon: Frame,
          };
    }
    // sweeping
    const turn = sweep.tooFast
      ? "A little slower"
      : sweep.step === "left"
        ? "Slowly turn left"
        : sweep.step === "right"
          ? "Now turn right"
          : "Back to the middle";
    return manual
      ? {
          title: turn,
          sub: "No motion sensor — drag sideways to turn.",
          Icon: Hand,
        }
      : { title: turn, sub: "Keep the mural in view.", Icon: Frame };
  })();

  const nearbyCount = nearby.murals.length;

  return (
    <AppShell tabs={false} bleed>
      <div
        ref={screenRef}
        className="relative h-full w-full touch-none overflow-hidden bg-black"
        onPointerDown={(e) => manual && phase === "sweeping" && (drag.current = e.clientX)}
        onPointerMove={(e) => {
          if (drag.current == null) return;
          compass.dragBy((drag.current - e.clientX) * -0.12);
          drag.current = e.clientX;
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <video
          ref={camera.attachVideo}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: camera.isPlaying ? 1 : 0 }}
        />
        {!camera.isPlaying && <div className="ar-grid bg-ar-void absolute inset-0" />}

        {/* Soft vignette so chrome reads over any wall. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,transparent_38%,hsl(var(--ar-void)/0.55)_100%)]" />
        <div className="from-ar-void/85 via-ar-void/40 to-ar-void/0 pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-linear-to-t" />

        {/* The outline replaces the static brackets once the art is found. */}
        {live && !(phase === "sweeping" ? sweepOutline : detector.outline) && (
          <MuralViewfinder
            state={
              phase === "sweeping"
                ? "sweeping"
                : phase === "locked"
                  ? "locked"
                  : detector.state === "ready"
                    ? "searching"
                    : "idle"
            }
            score={detector.score}
          />
        )}
        {live && (
          <MuralOutline
            outline={phase === "sweeping" ? sweepOutline : detector.outline}
            aspect={detector.frameAspect}
            mode={phase === "sweeping" ? "sweeping" : phase === "locked" ? "locked" : "acquiring"}
            kind={detector.kind}
            score={detector.score}
            offsetX={phase === "sweeping" ? -sweep.delta * pxPerDeg : 0}
            targetOffsetX={
              phase !== "sweeping"
                ? null
                : sweep.step === "left"
                  ? SWEEP_SIDE_DEG * pxPerDeg
                  : sweep.step === "right"
                    ? -SWEEP_SIDE_DEG * pxPerDeg
                    : sweep.step === "centre"
                      ? 0
                      : null
            }
          />
        )}
        {phase === "sweeping" && <EdgeChevrons step={sweep.step} />}

        {/* ── Top chrome ─────────────────────────────────────────────── */}
        <div
          className="absolute inset-x-0 z-20 flex items-start justify-between px-4"
          style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
        >
          {signedIn ? (
            <button
              onClick={() => void router.push("/collection?tab=murals")}
              className="ar-glass text-gold flex h-9 items-center gap-1.5 rounded-full px-3"
              aria-label={`${platformBranding.coinName} balance`}
            >
              <Coins size={14} strokeWidth={2.5} />
              <span className="font-hud text-[12px] font-bold tabular-nums">
                {(balance.data?.balance ?? 0).toLocaleString()}
              </span>
            </button>
          ) : (
            <span className="w-9" />
          )}
          <CameraModeSwitch mode="murals" />
          <button
            onClick={() => router.back()}
            aria-label="Close camera"
            className="ar-glass text-ar-text flex h-9 w-9 items-center justify-center rounded-full"
          >
            <X size={17} strokeWidth={2.4} />
          </button>
        </div>

        {live && (nearbyCount > 0 || roughGps) && (
          <div
            className="absolute left-1/2 z-20 -translate-x-1/2"
            style={{ top: "calc(var(--ar-top-inset) + 60px)" }}
          >
            <span className="ar-glass font-hud text-ar-dim inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-bold tracking-[0.12em] whitespace-nowrap uppercase">
              <MapPin
                size={11}
                strokeWidth={2.6}
                className={roughGps ? "text-warning" : "text-rarity-epic"}
              />
              {roughGps
                ? `Location rough · ±${Math.round(fix.accuracy)} m`
                : `${nearbyCount} mural${nearbyCount === 1 ? "" : "s"} nearby`}
            </span>
          </div>
        )}

        {/* ── Bottom guidance ────────────────────────────────────────── */}
        {live && (
          <div
            className="absolute inset-x-0 bottom-0 z-20 px-5"
            style={{ paddingBottom: "max(22px, var(--ar-safe-bottom))" }}
          >
            <AnimatePresence>
              {toast && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-ar-void/80 text-ar-text mx-auto mb-2 w-fit rounded-full px-3 py-1.5 text-[11.5px]"
                >
                  {toast}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="ar-glass rounded-ar-lg mx-auto max-w-[21rem] p-4 text-center">
              {!packOk ? (
                <div className="mb-2 text-left">
                  <PackPanel compact />
                </div>
              ) : phase === "sweeping" ? (
                <>
                  <GhostPhone step={sweep.step} />
                  <SweepGauge delta={sweep.delta} step={sweep.step} captured={captured} />
                </>
              ) : (
                <span
                  className={cn(
                    "mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-full border",
                    phase === "locked"
                      ? "border-rarity-epic/60 bg-rarity-epic/20 text-rarity-epic"
                      : "text-ar-dim border-white/20 bg-white/[0.06]",
                  )}
                >
                  <Icon size={17} strokeWidth={2.3} />
                </span>
              )}

              <p
                className="font-hud text-ar-text mt-1 text-[13px] font-bold tracking-[0.12em] uppercase"
                aria-live="polite"
              >
                {title}
              </p>
              {sub && (
                <p className="text-ar-dim mx-auto mt-1.5 max-w-[17rem] text-[11.5px] leading-relaxed">
                  {sub}
                </p>
              )}

              {detector.state === "error" && (
                <ArButton
                  variant="primary"
                  size="md"
                  block
                  icon={RotateCcw}
                  className="mt-3"
                  onClick={() => router.reload()}
                >
                  Reload
                </ArButton>
              )}
              {phase === "locked" && !signedIn && (
                <ArButton
                  variant="primary"
                  size="md"
                  block
                  className="mt-3"
                  onClick={() => requireAuth("murals")}
                >
                  Sign in to collect
                </ArButton>
              )}
              {phase === "locked" && atLimit && (
                <ArButton
                  variant="ghost"
                  size="md"
                  block
                  className="mt-2"
                  onClick={() => void router.push("/map")}
                >
                  Find other murals
                </ArButton>
              )}
            </div>
          </div>
        )}

        {/* ── Sending / result ───────────────────────────────────────── */}
        <AnimatePresence>
          {(phase === "sending" || phase === "result") && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-ar-void/80 absolute inset-0 z-30 flex items-center justify-center px-6 backdrop-blur-[3px]"
            >
              {phase === "sending" && (
                <ScanVerifying
                  frames={[frameUrls[0], frameUrls[1], frameUrls[2]].filter((u): u is string =>
                    Boolean(u),
                  )}
                  outcome={verifyOutcome}
                />
              )}
              {phase === "result" && result && (
                <ScanResult
                  result={result}
                  photo={frameUrls[1] ?? null}
                  onDone={() => void router.push("/map")}
                  onRetry={restart}
                  onName={() => setNaming(true)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {result && result.kind !== "rejected" && (
          <NameMuralSheet
            muralId={result.mural.id}
            autoTitle={result.mural.title}
            open={naming}
            onClose={() => {
              setNaming(false);
              void router.push("/map");
            }}
          />
        )}

        <div className="ar-scanlines pointer-events-none absolute inset-0 z-10 opacity-20" />
      </div>
    </AppShell>
  );
}
