"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Camera, Check, Loader2, QrCode, TriangleAlert, X } from "lucide-react";
import { useQueryParams, useRouter } from "~/lib/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CameraModeSwitch } from "~/components/ar/CameraModeSwitch";
import { AppShell } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { useAuth } from "~/lib/ar/store";
import { useCamera } from "~/lib/ar/useCamera";
import { pinIdFromScan, useQrScanner } from "~/lib/ar/useQrScanner";
import { useCollectPinByQr } from "~/lib/ar/usePins";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── /scan ──────────────────────────────────────────────────────────────────
 *
 * The QR path into a drop — the one that needs no location permission and
 * works in a basement, which is why storefront pins use it.
 *
 * Worth noting what this screen is *not* for: the primary QR journey never
 * touches it. A sticker on a table tent is scanned with the phone's own
 * camera app and deep-links straight to the pin. This is the in-app scanner
 * for someone who is already here and sees a code across the room.
 *
 * Two ways in, both landing here:
 *
 *   /scan            the in-app scanner — decodes off the viewfinder below.
 *   /scan?pin=<id>   the deep link a printed code actually encodes, opened by
 *                    the phone's own camera app. No camera needed on this
 *                    screen at all; it claims straight away.
 */
type Phase = "scanning" | "claiming" | "done" | "failed";

export default function ScanScreen() {
  const router = useRouter();
  const { query: urlQuery, ready: urlReady } = useQueryParams();
  const deepLinkPin =
    typeof urlQuery.pin === "string" ? urlQuery.pin : null;

  // A deep link carries its own pin, so the camera would be a permission
  // prompt for nothing.
  const camera = useCamera({ enabled: !deepLinkPin });
  const [asked, setAsked] = useState(false);

  const requireAuth = useAuth((s) => s.requireAuth);
  const collectByQr = useCollectPinByQr();

  const [phase, setPhase] = useState<Phase>("scanning");
  const [message, setMessage] = useState<string | null>(null);

  // The decoder fires on every frame a code is visible in, which for a code
  // held steady is several times a second. Without this the first scan would
  // send a burst of identical claims, and the ones after the first would each
  // come back "You've already collected this one".
  const handledRef = useRef<string | null>(null);

  const claim = useCallback(
    (locationId: string) => {
      if (handledRef.current === locationId) return;
      handledRef.current = locationId;

      if (!requireAuth("collect")) {
        handledRef.current = null;
        return;
      }

      setPhase("claiming");
      setMessage(null);
      collectByQr.mutate(
        { locationId },
        {
          onSuccess: () => {
            setPhase("done");
            setTimeout(() => {
              void router.replace(`/collection/${locationId}`);
            }, 1100);
          },
          onError: (err) => {
            setPhase("failed");
            setMessage(err.message);
            // Let them try a different code without reloading the screen.
            setTimeout(() => {
              handledRef.current = null;
              setPhase("scanning");
              setMessage(null);
            }, 3200);
          },
        },
      );
    },
    [collectByQr, requireAuth, router],
  );

  // Deep link: claim as soon as the route is ready, no camera involved.
  useEffect(() => {
    if (deepLinkPin) claim(deepLinkPin);
  }, [deepLinkPin, claim]);

  useEffect(() => {
    if (deepLinkPin !== null || asked) return;
    setAsked(true);
    void camera.start();
  }, [asked, camera, deepLinkPin]);

  useQrScanner({
    video: camera.videoNode,
    enabled: !deepLinkPin && phase === "scanning" && camera.isPlaying,
    onResult: (text) => {
      const id = pinIdFromScan(text);
      if (!id) {
        setMessage(`That isn't a ${platformBranding.name} code.`);
        return;
      }
      claim(id);
    },
  });

  return (
    <AppShell tabs={false} bleed>
      <div className="relative h-full w-full overflow-hidden bg-black">
        <video
          ref={camera.attachVideo}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: camera.isPlaying ? 1 : 0 }}
        />

        {!camera.isPlaying && (
          <div className="ar-grid absolute inset-0 bg-ar-void" />
        )}

        {/* Dim everything except the target square. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-ar-void/72"
          style={{
            maskImage:
              "radial-gradient(circle at 50% 44%, transparent 0, transparent 120px, black 168px)",
            WebkitMaskImage:
              "radial-gradient(circle at 50% 44%, transparent 0, transparent 120px, black 168px)",
          }}
        />

        {/* ── Viewfinder ────────────────────────────────────────────── */}
        <div className="absolute left-1/2 top-[44%] h-[228px] w-[228px] -translate-x-1/2 -translate-y-1/2">
          <svg viewBox="0 0 228 228" fill="none" className="absolute inset-0">
            {[
              "M3 62V21a18 18 0 0 1 18-18h41",
              "M166 3h41a18 18 0 0 1 18 18v41",
              "M225 166v41a18 18 0 0 1-18 18h-41",
              "M62 225H21a18 18 0 0 1-18-18v-41",
            ].map((d) => (
              <path
                key={d}
                d={d}
                stroke="hsl(var(--ar-green-hot))"
                strokeWidth="4"
                strokeLinecap="round"
              />
            ))}
          </svg>

          {/* A CSS animation (`.ar-scan-sweep`), not a framer-motion one.
              framer-motion recomputes the value on the main thread every
              frame, so it stutters in step with the decode loop running
              beside it — the two compete for the same thread. In CSS this is
              handed to the compositor and keeps its own time regardless. */}
          {camera.isPlaying && phase === "scanning" && (
            <div
              aria-hidden
              className="ar-scan-sweep absolute inset-x-4 top-0 h-[2px] rounded-full bg-ar-green-hot shadow-[0_0_12px_2px_hsl(var(--ar-green)/0.7)]"
            />
          )}
        </div>

        {/* ── Chrome ────────────────────────────────────────────────── */}
        {/* No switch on a deep link: that path never opens the camera, it
            just claims the code the phone's own camera already read. */}
        {!deepLinkPin && (
          <div
            className="absolute left-1/2 z-20 -translate-x-1/2"
            style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
          >
            <CameraModeSwitch mode="qr" />
          </div>
        )}
        <button
          onClick={() => router.back()}
          aria-label="Close scanner"
          className="ar-glass absolute right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full text-ar-text"
          style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
        >
          <X size={17} strokeWidth={2.4} />
        </button>

        {/* ── Claim status ──────────────────────────────────────────── */}
        <AnimatePresence>
          {phase !== "scanning" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-ar-void/80 px-8"
              role="status"
            >
              <div className="ar-glass w-full max-w-[19rem] rounded-ar-lg p-6 text-center">
                {phase === "claiming" && (
                  <>
                    <Loader2
                      size={26}
                      strokeWidth={2.4}
                      className="mx-auto animate-spin text-ar-green-hot"
                    />
                    <p className="font-hud mt-3 text-[12.5px] font-bold uppercase tracking-[0.12em] text-ar-text">
                      Claiming
                    </p>
                  </>
                )}

                {phase === "done" && (
                  <>
                    <motion.span
                      initial={{ scale: 0.6 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 18 }}
                      className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-ar-green/60 bg-ar-green/18 text-ar-green-hot"
                    >
                      <Check size={24} strokeWidth={3} />
                    </motion.span>
                    <p className="font-hud mt-3 text-[13px] font-bold uppercase tracking-[0.12em] text-ar-green-hot">
                      Collected
                    </p>
                    <p className="mt-1.5 text-[11.5px] text-ar-dim">
                      Opening your collectible…
                    </p>
                  </>
                )}

                {phase === "failed" && (
                  <>
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-ar-danger/60 bg-ar-danger/15 text-ar-danger">
                      <TriangleAlert size={22} strokeWidth={2.4} />
                    </span>
                    <p className="font-hud mt-3 text-[12.5px] font-bold uppercase tracking-[0.12em] text-ar-text">
                      Couldn&apos;t collect
                    </p>
                    {/* Server messages are written to be shown as-is —
                        "Follow this brand to unlock", "Every one of these has
                        been claimed" — so they are, rather than being
                        flattened into a generic failure. */}
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-ar-dim">
                      {message}
                    </p>
                    {deepLinkPin && (
                      <ArLinkButton
                        href={`/collection/${deepLinkPin}`}
                        variant="outline"
                        size="sm"
                        block
                        className="mt-3"
                      >
                        View the drop
                      </ArLinkButton>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className="absolute inset-x-0 bottom-0 z-20 px-6"
          style={{ paddingBottom: "max(24px, var(--ar-safe-bottom))" }}
        >
          <div className="ar-glass mx-auto max-w-[21rem] rounded-ar-lg p-4 text-center">
            <span className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-ar-green/50 bg-ar-green/14 text-ar-green-hot">
              <QrCode size={17} strokeWidth={2.3} />
            </span>

            <p className="font-hud text-[12.5px] font-bold uppercase tracking-[0.12em] text-ar-text">
              {camera.isPlaying
                ? `Point at a ${platformBranding.name} code`
                : camera.state === "denied"
                  ? "Camera blocked"
                  : "Starting camera…"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[17rem] text-[11.5px] leading-relaxed text-ar-dim">
              {message && phase === "scanning"
                ? message
                : camera.isPlaying
                  ? "Storefront and indoor drops use a printed code — no location permission needed."
                  : camera.state === "denied"
                    ? "Allow camera access for this site, then try again."
                    : "One moment."}
            </p>

            {camera.state === "denied" && (
              <ArButton
                variant="primary"
                size="md"
                block
                icon={Camera}
                className="mt-3"
                onClick={() => void camera.start()}
              >
                Try again
              </ArButton>
            )}

            <ArLinkButton
              href="/map"
              variant="ghost"
              size="sm"
              block
              className="mt-2"
            >
              Back to the map
            </ArLinkButton>
          </div>
        </div>

        <div className="ar-scanlines pointer-events-none absolute inset-0 z-10 opacity-30" />
      </div>
    </AppShell>
  );
}
