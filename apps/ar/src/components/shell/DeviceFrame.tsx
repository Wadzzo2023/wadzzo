import { Camera, MapPin, Smartphone } from "lucide-react";
import { type ReactNode } from "react";

import { WadzzoMark } from "~/components/brand/WadzzoMark";

/** Why this exists at all, for anyone reading the caption cold on a laptop. */
const CAPTION_PERKS = [
  { icon: Camera, text: "Capture drops in live AR" },
  { icon: MapPin, text: "Tied to real places, not menus" },
  { icon: Smartphone, text: "No install — runs in the browser" },
] as const;

/**
 * ── DeviceFrame ────────────────────────────────────────────────────────────
 *
 * Wadzzo AR is a mobile web app with no desktop layout — not because desktop
 * is unsupported, but because there is nothing to lay out differently. The
 * screens are a camera feed, a map, and a stack of cards. So on a big screen
 * we don't stretch them; we present the phone.
 *
 * Three presentations, all pure CSS so there's no resize listener and no
 * server/client mismatch to hydrate around:
 *
 *   < 640px   phone           full bleed, safe-area insets respected
 *   640-1023  tablet          centred slab, max 600px, rounded and outlined
 *   >= 1024   desktop         full device shell — bezel, island, side keys,
 *                             sitting on an ambient backdrop
 *
 * The frame is `fixed` and the document never scrolls (see arcade.css); every
 * screen scrolls inside its own pane. That's what keeps a browser window from
 * ever rubber-banding the "phone" off the page.
 */
export function DeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 isolate flex items-center justify-center bg-ar-void">
      <AmbientBackdrop />

      {/* Caption, wide screens only — orients someone who opened this on a
          laptop and wonders why they're looking at a phone.

          The lockup here (big WADZZO + small AR plate) matches the boot
          sequence's own brand mark rather than inventing a second hierarchy
          — the previous version stacked a tiny "Wadzzo" eyebrow over a huge
          "AR", which read as if AR were the product name and Wadzzo its
          subtitle. It's the other way around everywhere else in the app. */}
      <div className="pointer-events-none absolute left-10 top-1/2 hidden max-w-[19rem] -translate-y-1/2 xl:block">
        {/* Icon in a framed, gently pulsing plate rather than floating bare —
            gives it the same presence the boot sequence gives it, at rest. */}
        <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-2xl border border-ar-green/30 bg-ar-surface/60"
          />
          <span
            aria-hidden
            className="animate-pulse-ring absolute inset-0 rounded-2xl border border-ar-green-hot/50"
          />
          <WadzzoMark glow className="relative h-9 w-auto" />
        </div>

        <div className="flex items-center gap-2">
          <p className="font-hud text-4xl font-bold leading-none tracking-tight text-ar-text">
            WADZZO
          </p>
          <span
            className="font-hud flex h-6 items-center rounded-[6px] border border-ar-green px-1.5 text-[13px] font-bold tracking-[0.1em] text-ar-green-hot"
            style={{
              background: "hsl(var(--ar-green) / 0.14)",
              boxShadow:
                "0 0 16px -2px hsl(var(--ar-green)/0.7), inset 0 0 10px -3px hsl(var(--ar-green)/0.8)",
            }}
          >
            AR
          </span>
        </div>

        <p className="font-hud mt-2 text-[10.5px] uppercase tracking-[0.32em] text-ar-green">
          Collect the real world.
        </p>

        <p className="mt-4 text-[13px] leading-relaxed text-ar-faint">
          A mobile web app. No install, no store — scan a code and you&rsquo;re
          already inside it.
        </p>

        <div className="mt-5 space-y-2.5 border-t border-ar-line pt-4">
          {CAPTION_PERKS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-ar-green/35 bg-ar-green/10 text-ar-green-hot">
                <Icon size={12} strokeWidth={2.3} />
              </span>
              <span className="text-[12px] leading-snug text-ar-dim">
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── The device ──────────────────────────────────────────────────── */}
      <div
        className={[
          "relative z-10 h-full w-full",
          // Tablet: a centred slab with a hairline edge.
          "sm:h-[min(100dvh-3rem,1000px)] sm:w-[min(100%-3rem,600px)] sm:rounded-[36px]",
          "sm:border sm:border-ar-line sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]",
          // Desktop: a real phone shell.
          "lg:h-[min(100dvh-4rem,932px)] lg:w-[430px] lg:rounded-[56px]",
          "lg:border-[11px] lg:border-[#171d19]",
          // Two rings on the bezel: a bright inner one that reads as the
          // polished edge of the glass, and a soft green outer one that lifts
          // the whole object off a background almost as dark as it is.
          "lg:shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_0_4px_rgba(120,255,150,0.07),0_50px_140px_-30px_rgba(0,0,0,1),inset_0_0_0_1px_rgba(255,255,255,0.1)]",
        ].join(" ")}
      >
        {/* Side keys — desktop only, purely to sell the object. */}
        <span className="absolute -left-[15px] top-[132px] hidden h-12 w-[4px] rounded-l-sm bg-[#242b26] lg:block" />
        <span className="absolute -left-[15px] top-[196px] hidden h-20 w-[4px] rounded-l-sm bg-[#242b26] lg:block" />
        <span className="absolute -right-[15px] top-[176px] hidden h-28 w-[4px] rounded-r-sm bg-[#242b26] lg:block" />

        {/* Screen. `isolate` keeps the app's blend modes (holo foil, camera
            overlays) from reaching the bezel and backdrop behind it.
            Rounding comes from `.ar-screen-clip` rather than a rounded-*
            utility — see the note in arcade.css about Safari refusing to clip
            the Mapbox canvas to a rounded overflow box.

            `data-ar-app-frame` is the portal target anything outside React's
            own tree needs to render into — the wallet-connect dialog's
            `DialogPortal` looks for this exact attribute rather than falling
            back to `document.body`, so it renders as part of the phone
            instead of as an ordinary desktop modal spanning the browser. */}
        <div
          data-ar-app-frame
          className="ar-noise ar-screen-clip relative isolate h-full w-full overflow-hidden bg-ar-bg"
        >
          {children}

          {/* Dynamic island, drawn over the app the way the real one is. */}
          <div className="pointer-events-none absolute left-1/2 top-[11px] z-50 hidden h-[30px] w-[112px] -translate-x-1/2 rounded-full bg-black lg:block">
            <span className="absolute right-[13px] top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-[#0d1a12] ring-1 ring-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The room the phone sits in: a green-tinted void, a terrain grid falling
 * away toward the edges, and two slow drifting blooms so the backdrop is
 * never completely static behind a static screen.
 */
function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block"
    >
      <div className="ar-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_60%_at_50%_45%,black,transparent)]" />
      <div className="absolute left-1/2 top-1/2 h-[780px] w-[780px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--ar-green)/0.16),transparent_62%)] blur-[70px]" />
      <div className="animate-float absolute left-[14%] top-[18%] h-72 w-72 rounded-full bg-[radial-gradient(circle,hsl(192_88%_56%/0.14),transparent_65%)] blur-[80px]" />
      <div
        className="animate-float absolute bottom-[12%] right-[12%] h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(272_82%_66%/0.13),transparent_65%)] blur-[80px]"
        style={{ animationDelay: "2s" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_35%,hsl(var(--ar-void))_100%)]" />
    </div>
  );
}
