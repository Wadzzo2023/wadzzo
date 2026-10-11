import { motion } from "framer-motion";
import { Camera, Check, Compass, MapPin, Minus, X } from "lucide-react";

import { CameraModeSwitch, type CameraMode } from "~/components/ar/CameraModeSwitch";
import { useRouter } from "~/lib/navigation";
import { useMemo } from "react";

import { ArButton } from "~/components/ui/ArButton";
import { detectPlatform, LOCATION_STEPS } from "~/lib/ar/locationHelp";
import { cn } from "~/lib/utils";

export type PermState =
  | "pending"
  | "granted"
  | "denied"
  | "unsupported"
  | "insecure";

/** Copy shown in place of the explainer once a permission has resolved badly. */
const FALLBACK_COPY: Partial<Record<PermState, string>> = {
  denied:
    "Blocked. Re-enable it in your browser's site settings for this page.",
  unsupported:
    "Not available on this device — you'll be able to drag to look around instead.",
  // Browsers refuse motion sensors outside HTTPS with no prompt and no
  // error — this is the one state on this screen with a real fix rather
  // than a shrug, so it gets to say what that fix is.
  insecure: "This page needs to be loaded over HTTPS for the compass to work.",
};

const ITEMS = [
  {
    key: "camera" as const,
    icon: Camera,
    title: "Camera",
    why: "The live view the pins are drawn over. Nothing is recorded or uploaded.",
  },
  {
    key: "location" as const,
    icon: MapPin,
    title: "Location",
    why: "Works out which drops are within 75 m of you, and where to place them.",
  },
  {
    key: "motion" as const,
    icon: Compass,
    title: "Motion & compass",
    why: "Tells us which way you're facing so a pin stays put when you turn.",
  },
];

/** Per-camera-mode wording. AR's is the default; Murals passes its own. */
export type GateCopy = {
  mode: CameraMode;
  title: string;
  body: string;
  why?: Partial<Record<"camera" | "location" | "motion", string>>;
  /** Per-mode override for the "unsupported" line (AR can fall back to drag; Murals can't). */
  unsupported?: Partial<Record<"camera" | "location" | "motion", string>>;
  cta: string;
  footnote: string;
};

const AR_COPY: GateCopy = {
  mode: "ar",
  title: "Enter AR",
  body: "Point your phone at the world and the drops around you appear where they actually are.",
  cta: "Allow & enter AR",
  footnote:
    "Nothing from your camera leaves the device. Your position is only used to work out which drops are in range.",
};

/**
 * ── ArPermissionGate ───────────────────────────────────────────────────────
 *
 * All three permissions are requested from one tap, for one reason that is
 * not cosmetic: iOS only honours `DeviceOrientationEvent.requestPermission()`
 * inside a user gesture. A screen that asks for camera first and compass
 * later silently loses the compass, and the AR view comes up with every pin
 * pinned due north.
 *
 * Each permission says what it's for before it's asked. A bare triple prompt
 * from a page someone reached by scanning a sticker on a café table is how
 * you get three denials.
 */
export function ArPermissionGate({
  states,
  requesting,
  onRequest,
  error,
  copy = AR_COPY,
}: {
  states: Record<"camera" | "location" | "motion", PermState>;
  requesting: boolean;
  onRequest: () => void;
  error: string | null;
  copy?: GateCopy;
}) {
  const router = useRouter();
  const anyDenied = Object.values(states).some(
    (s) => s === "denied" || s === "insecure",
  );
  const platform = useMemo(detectPlatform, []);
  const locationSteps = LOCATION_STEPS[platform];

  return (
    <div className="ar-grid relative flex h-full flex-col overflow-hidden bg-ar-void">
      <div className="absolute left-1/2 top-[26%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--ar-green)/0.2),transparent_64%)] blur-[60px]" />

      <button
        onClick={() => router.back()}
        aria-label="Close"
        className="ar-glass absolute right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full text-ar-dim"
        style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
      >
        <X size={17} strokeWidth={2.4} />
      </button>

      <div
        className="absolute left-1/2 z-20 -translate-x-1/2"
        style={{ top: "calc(var(--ar-top-inset) + 14px)" }}
      >
        <CameraModeSwitch mode={copy.mode} />
      </div>

      {/* Tall enough to overflow on a short screen, so it needs the top inset
          as real padding to keep the viewfinder clear of the status bar, the
          island and the mode switch (which sits at inset + 14px, 36px tall). */}
      <div
        className="ar-scroll relative z-10 flex flex-1 flex-col px-7 pb-10"
        style={{ paddingTop: "calc(var(--ar-top-inset) + 66px)" }}
      >
        {/* Viewfinder mark. `mt-auto` here and `mb-auto` on the footnote
            centre the column when it fits — and, unlike `justify-center`,
            let it scroll from the top when it doesn't instead of pushing
            the heading off-screen. */}
        <div className="relative mx-auto mb-7 mt-auto h-[88px] w-[88px] shrink-0">
          <motion.svg
            viewBox="0 0 88 88"
            fill="none"
            className="absolute inset-0"
            animate={{ scale: [1, 0.94, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            {[
              "M2 24V10a8 8 0 0 1 8-8h14",
              "M64 2h14a8 8 0 0 1 8 8v14",
              "M86 64v14a8 8 0 0 1-8 8H64",
              "M24 86H10a8 8 0 0 1-8-8V64",
            ].map((d) => (
              <path
                key={d}
                d={d}
                stroke="hsl(var(--ar-green-hot))"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            ))}
          </motion.svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera
              size={30}
              strokeWidth={1.7}
              className="text-ar-green-hot drop-shadow-[0_0_12px_hsl(var(--ar-green)/0.9)]"
            />
          </div>
        </div>

        <h1 className="font-hud text-center text-[24px] font-bold leading-tight text-ar-text">
          {copy.title}
        </h1>
        <p className="mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-relaxed text-ar-dim">
          {copy.body}
        </p>

        <ul className="mt-7 space-y-2">
          {ITEMS.map(({ key, icon: Icon, title, why }) => {
            const state = states[key];
            return (
              <li
                key={key}
                className={cn(
                  "ar-bevel flex items-start gap-3 rounded-ar p-3.5",
                  state === "granted" && "!border-ar-green/45",
                  (state === "denied" || state === "insecure") &&
                    "!border-ar-danger/45",
                )}
              >
                <span
                  className={cn(
                    "mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border",
                    state === "granted"
                      ? "border-ar-green/50 bg-ar-green/14 text-ar-green-hot"
                      : state === "denied" || state === "insecure"
                        ? "border-ar-danger/50 bg-ar-danger/14 text-ar-danger"
                        : "border-ar-line bg-white/[0.04] text-ar-faint",
                  )}
                >
                  {state === "granted" ? (
                    <Check size={15} strokeWidth={3} />
                  ) : state === "denied" || state === "insecure" ? (
                    <X size={15} strokeWidth={3} />
                  ) : state === "unsupported" ? (
                    <Minus size={15} strokeWidth={3} />
                  ) : (
                    <Icon size={15} strokeWidth={2.2} />
                  )}
                </span>

                <div className="min-w-0">
                  <p className="font-hud text-[12.5px] font-bold uppercase tracking-[0.1em] text-ar-text">
                    {title}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ar-faint">
                    {(state === "unsupported" ? copy.unsupported?.[key] : undefined) ??
                      FALLBACK_COPY[state] ??
                      copy.why?.[key] ??
                      why}
                  </p>

                  {/* Location gets real per-platform steps rather than the
                      generic line above — once a browser denies it, it stops
                      re-prompting, and "re-enable it in site settings" is not
                      where the actual control lives on a phone. */}
                  {key === "location" && state === "denied" && (
                    <ol className="mt-2.5 space-y-1.5 border-t border-ar-line pt-2.5">
                      {locationSteps.steps.map((step, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="font-hud mt-[1px] w-3.5 shrink-0 text-[9.5px] font-bold tabular-nums text-ar-green">
                            {i + 1}
                          </span>
                          <span className="text-[11px] leading-relaxed text-ar-faint">
                            {step}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {error && (
          <p className="mt-4 text-center text-[12px] leading-relaxed text-ar-danger">
            {error}
          </p>
        )}

        <div className="mt-7 space-y-2">
          <ArButton
            variant="primary"
            size="lg"
            block
            icon={Camera}
            onClick={onRequest}
            disabled={requesting}
          >
            {requesting
              ? "Asking…"
              : anyDenied
                ? "Try again"
                : copy.cta}
          </ArButton>
          <ArButton
            variant="ghost"
            size="md"
            block
            onClick={() => void router.push("/map")}
          >
            Back to the map
          </ArButton>
        </div>

        <p className="mb-auto mt-5 text-center text-[10.5px] leading-relaxed text-ar-faint">
          {copy.footnote}
        </p>
      </div>
    </div>
  );
}
