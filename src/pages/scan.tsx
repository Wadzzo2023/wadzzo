import { motion } from "framer-motion";
import { Camera, QrCode, X } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { AppShell } from "~/components/shell/AppShell";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { useCamera } from "~/lib/ar/useCamera";

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
 * ── Milestone 1 note ──
 * The viewfinder and permission flow are real; decoding is not yet wired.
 * `jsqr` and `react-zxing` are both already in the dependency list — the
 * decode loop reads frames off this same video element into a canvas and
 * resolves to `/collection/<id>`.
 */
export default function ScanScreen() {
  const router = useRouter();
  const camera = useCamera({ enabled: true });
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    if (asked) return;
    setAsked(true);
    void camera.start();
  }, [asked, camera]);

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

          {camera.isPlaying && (
            <motion.div
              aria-hidden
              className="absolute inset-x-4 h-[2px] rounded-full bg-ar-green-hot shadow-[0_0_20px_4px_hsl(var(--ar-green)/0.85)]"
              animate={{ top: ["6%", "94%", "6%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* ── Chrome ────────────────────────────────────────────────── */}
        <button
          onClick={() => router.back()}
          aria-label="Close scanner"
          className="ar-glass absolute right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full text-ar-text"
          style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
        >
          <X size={17} strokeWidth={2.4} />
        </button>

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
                ? "Point at a Wadzzo code"
                : camera.state === "denied"
                  ? "Camera blocked"
                  : "Starting camera…"}
            </p>
            <p className="mx-auto mt-1.5 max-w-[17rem] text-[11.5px] leading-relaxed text-ar-dim">
              {camera.isPlaying
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
