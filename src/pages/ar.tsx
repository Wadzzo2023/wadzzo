import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ArPermissionGate, type PermState } from "~/components/ar/ArPermissionGate";
import { ArSceneWebGL } from "~/components/ar/ArSceneWebGL";
import { CollectCelebration } from "~/components/fx/CollectCelebration";
import { AppShell } from "~/components/shell/AppShell";
import { useAuth } from "~/lib/ar/store";
import type { ArPin } from "~/lib/ar/types";
import { useFeedback } from "~/lib/ar/feedback";
import { useCamera } from "~/lib/ar/useCamera";
import { useDeviceHeading } from "~/lib/ar/useDeviceHeading";
import { useGeolocation } from "~/lib/ar/useGeolocation";
import { useCollectPin, useDiscoveryPins } from "~/lib/ar/usePins";

/**
 * ── /ar ────────────────────────────────────────────────────────────────────
 *
 * Two states: the permission gate, then the scene.
 *
 * All three permissions are requested from the gate's single tap — see the
 * note in ArPermissionGate for why splitting them breaks iOS. The scene then
 * runs whether or not every one was granted: a denied camera falls back to
 * the simulated horizon, and a missing compass falls back to drag-to-look.
 * Refusing to show anything because one sensor said no would strand the
 * viewer on a dead screen.
 *
 * Two query params, deliberately different:
 *   ?pin=<id>     single-pin mode — only this pin renders, range ignored.
 *                 How a card you already own gets revisited in AR from
 *                 anywhere, since there's nothing left to walk up to.
 *   ?target=<id>  a soft preference — every nearby capturable pin still
 *                 renders and range still applies. How the map's "Capture
 *                 in AR" hands off a specific not-yet-collected pin: it
 *                 only breaks a tie in that pin's favour once you've
 *                 actually turned toward it, rather than pretending you
 *                 already collected the thing you're walking over to get.
 */

/**
 * Was a temporary kill switch while the compass got re-derived. The hand-
 * rolled trig in `heading.ts` has been replaced by a port of three.js's
 * `DeviceOrientationControls` (the technique LocAR.js and most location-AR
 * projects build on — found working in the sibling `bandfan` project),
 * expressed as a quaternion rather than raw matrix columns. Verified to
 * reproduce every existing unit-tested case exactly before the switch below
 * went back to `true`. Left in place rather than removed, in case it's ever
 * needed again.
 */
const COMPASS_ENABLED = true;

export default function ArScreen() {
  const router = useRouter();
  const focusPinId =
    typeof router.query.pin === "string" ? router.query.pin : undefined;
  const preferPinId =
    typeof router.query.target === "string" ? router.query.target : undefined;

  const [entered, setEntered] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState<ArPin | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const { fix, status: geoStatus } = useGeolocation();
  const camera = useCamera({ enabled: entered });
  const compass = useDeviceHeading();

  const requireAuth = useAuth((s) => s.requireAuth);
  const collectPin = useCollectPin();
  const feedback = useFeedback();

  const discoveryPins = useDiscoveryPins();

  /**
   * The map shows a locked, or already-collected, pin on purpose — a gated
   * drop you can see but can't take yet is the whole incentive to follow a
   * brand, and a collected one left visible (greyed) is a quiet "yes, you got
   * that." Both read fine in a 2D list you're browsing.
   *
   * Neither reads that way through the camera: a coin sitting right in front
   * of you that turns out to have nothing behind it — locked, or already
   * yours — is a dead end, not an invitation. So the AR scene only ever
   * places pins the viewer can actually act on *right now*. Both flags are
   * already resolved server-side (`locked` against live follow state and
   * token balance; `collected` — including `multiPin: false`'s "claiming any
   * one point claims the whole group" rule — against their actual claims),
   * so this only reads them, never re-derives them.
   *
   * One exception: the pin `focusPinId` (`?pin=`) asks for. That mode exists
   * specifically to revisit a pin already in the collection — filtering it
   * out here would make its one job impossible.
   */
  const pins = useMemo(
    () =>
      discoveryPins.filter(
        (p) => p.id === focusPinId || (!p.locked && !p.collected),
      ),
    [discoveryPins, focusPinId],
  );

  useEffect(() => {
    if (!captureError) return;
    const id = setTimeout(() => setCaptureError(null), 5_000);
    return () => clearTimeout(id);
  }, [captureError]);

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
      // Was `fix ? "granted" : "pending"` — a real denial sat as "pending"
      // forever, since the watch never resolves once blocked, and the user
      // never saw why AR wasn't coming up.
      location: fix ? "granted" : geoStatus === "denied" ? "denied" : "pending",
      // `unsupported` rather than the hook's own (permanently "pending")
      // state while the switch above is off — its existing copy already
      // reads "Not available on this device — you'll be able to drag to
      // look around instead," which is exactly true right now, just for a
      // different reason than usual.
      motion: COMPASS_ENABLED ? compass.permission : "unsupported",
    }),
    [camera.state, fix, geoStatus, compass.permission],
  );

  /**
   * One gesture, all three asks. Sequenced rather than raced: iOS shows one
   * system sheet at a time and drops whichever prompt arrives while another
   * is open.
   *
   * The order within that sequence is not arbitrary. iOS only honours
   * `DeviceOrientationEvent.requestPermission()` for a few seconds after the
   * tap that triggered this handler — call it too late and it's silently
   * refused, no dialog, no error. `camera.start()` calls `getUserMedia`,
   * which puts up its own native "Allow Camera" sheet; the time a person
   * takes to tap that routinely runs past compass's window. So compass goes
   * first, untouched by any prior await, and camera follows once compass's
   * own prompt has already been shown (`requestPermission()` only needs the
   * gesture to *start* the request, not to still be live when it resolves).
   *
   * Every step is bounded. `getUserMedia` never settles while its permission
   * bubble sits unanswered, and a viewer who wanders off mid-prompt would
   * otherwise be stranded on a disabled "Asking…" button with no way back.
   * Past the deadline we enter anyway — the scene is fully usable on the
   * simulated horizon, and because the video takes a callback ref, a stream
   * that resolves later still wires itself up and fades in. Nothing is lost
   * by not waiting.
   */
  const handleRequest = useCallback(async () => {
    setRequesting(true);
    setError(null);

    // Fires DeviceOrientationEvent's prompt (where it exists) while the tap
    // that called this handler is still fresh. No `within()` wrapper here —
    // racing it against a timeout would still let the timeout's `setTimeout`
    // callback run on a later tick, but the call itself needs to happen now,
    // synchronously relative to everything before it. Skipped while the
    // compass is switched off above — no point prompting for a sensor the
    // scene won't read from.
    if (COMPASS_ENABLED) await compass.request();

    /** Resolve to `null` if `p` hasn't settled within `ms`. */
    const within = <T,>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<null>((r) => setTimeout(() => r(null), ms)),
      ]);

    const gotCamera = await within(camera.start(), 12_000);

    // The `prefer-optional-chain` rule suggests `navigator?.x` here, which does
    // NOT work: optional chaining guards null/undefined *values*, not undeclared
    // identifiers. `navigator` is genuinely absent as a global during Next.js
    // SSR, where `navigator?.x` still throws a ReferenceError. The `typeof`
    // check is the only safe form, so the rule is suppressed rather than obeyed.
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      // The watch in useGeolocation already triggers the location prompt; this
      // just gives the gate something to wait on before it steps aside.
      await new Promise<void>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          () => resolve(),
          { enableHighAccuracy: true, timeout: 8_000 },
        ),
      );
    }

    setRequesting(false);

    if (gotCamera === false) {
      setError(
        "Camera unavailable — entering with a simulated view. Pin placement and capture still work.",
      );
    }
    setEntered(true);
  }, [camera, compass]);

  /**
   * The celebration only fires once the claim is actually recorded. Showing it
   * optimistically would mean congratulating someone on a card they didn't
   * get — the server can still refuse for range, eligibility or stock, and
   * those refusals are exactly the ones worth reading.
   */
  const handleCapture = useCallback(
    (pin: ArPin) => {
      if (!requireAuth("ar")) return;
      if (!fix) {
        setCaptureError("Waiting for a location fix before capturing.");
        return;
      }
      setCaptureError(null);
      collectPin.mutate(
        { locationId: pin.id, lat: fix.lat, lng: fix.lng },
        {
          onSuccess: () => {
            feedback.captured(pin.rarity);
            setCelebrating(pin);
          },
          onError: (err) => setCaptureError(err.message),
        },
      );
    },
    [requireAuth, fix, collectPin, feedback],
  );

  if (!entered) {
    return (
      <AppShell tabs={false} bleed>
        <ArPermissionGate
          states={states}
          requesting={requesting}
          onRequest={handleRequest}
          error={error}
        />
      </AppShell>
    );
  }

  return (
    <AppShell tabs={false} bleed>
      <ArSceneWebGL
        pins={pins}
        fix={fix}
        onCapture={handleCapture}
        videoElement={camera.videoNode}
        focusPinId={focusPinId}
        ignoreRange={Boolean(focusPinId)}
        preferPinId={preferPinId}
        videoEl={
          <video
            // Callback ref, not a plain one: the stream is acquired on the
            // permission gate, before this element exists.
            ref={camera.attachVideo}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-300"
            // Transparent until frames actually arrive, so there's no flash of
            // an empty black box before the feed comes up.
            style={{ opacity: camera.isPlaying ? 1 : 0 }}
          />
        }
      />

      {/* Why a capture was refused — range, eligibility, or stock. Sits above
          the scene because the reticle is where the viewer is looking when it
          happens. */}
      <AnimatePresence>
        {captureError && (
          <motion.div
            style={{ x: "-50%", top: "calc(var(--ar-top-inset) + 64px)" }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="ar-glass absolute left-1/2 z-50 max-w-[min(86%,23rem)] rounded-2xl px-4 py-2.5"
          >
            <p className="font-hud text-center text-[11px] font-semibold leading-relaxed tracking-[0.03em] text-ar-danger">
              {captureError}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {celebrating && (
          <CollectCelebration
            pin={celebrating}
            onDone={() => {
              const id = celebrating.id;
              setCelebrating(null);
              void router.push(`/collection/${id}`);
            }}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}

