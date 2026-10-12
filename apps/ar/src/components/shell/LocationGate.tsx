import { Compass, LocateFixed, Settings, Smartphone } from "lucide-react";
import { useMemo } from "react";

import { ArButton } from "~/components/ui/ArButton";
import { detectPlatform, LOCATION_STEPS } from "~/lib/ar/locationHelp";
import { GEO_REASON_TEXT, type GeoReason, type GeoStatus } from "~/lib/ar/useGeolocation";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * ── LocationGate ───────────────────────────────────────────────────────────
 *
 * Shown whenever there's no real fix. Wadzzo is a game about standing
 * somewhere, so there is no useful degraded mode: without a position the map
 * can't say what's near you, capture can't be range-gated, and the AR scene
 * has nothing to place drops against.
 *
 * A bare "enable location" button isn't enough on mobile. Once a site is
 * denied, browsers stop prompting entirely — tapping again does nothing at
 * all, which reads as a broken button. The only real fix lives several taps
 * deep in Settings, and it's in a different place on every platform. So the
 * instructions are the primary content here and the button is the shortcut,
 * not the other way round.
 */

export function LocationGate({
  status,
  reason,
  onRetry,
}: {
  status: GeoStatus;
  reason: GeoReason | null;
  onRetry: () => void;
}) {
  const platform = useMemo(detectPlatform, []);
  const guide = LOCATION_STEPS[platform];
  const asking = status === "prompting";

  return (
    <div className="ar-scroll bg-ar-bg absolute inset-0 z-40 flex flex-col items-center px-6 pt-[calc(var(--ar-top-inset)+56px)] pb-8">
      <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
        <span
          aria-hidden
          className="border-ar-green/30 bg-ar-surface/60 absolute inset-0 rounded-2xl border"
        />
        <span
          aria-hidden
          className="animate-pulse-ring border-ar-green-hot/50 absolute inset-0 rounded-2xl border"
        />
        <Compass size={28} strokeWidth={2} className="text-ar-green-hot relative" />
      </div>

      <h1 className="font-hud text-ar-text text-center text-[19px] leading-tight font-bold">
        {asking ? "Finding you…" : `${platformBranding.name} needs your location`}
      </h1>

      <p className="text-ar-dim mt-2.5 max-w-[19rem] text-center text-[13px] leading-relaxed">
        {reason
          ? GEO_REASON_TEXT[reason]
          : "Every drop sits at a real place. Without your position there's nothing to walk to."}
      </p>

      <div className="mt-5 w-full max-w-[19rem]">
        <ArButton
          variant="primary"
          size="lg"
          block
          icon={LocateFixed}
          busy={asking}
          onClick={onRetry}
        >
          {asking ? "Locating" : "Enable location"}
        </ArButton>
      </div>

      {/* Only worth showing once something has actually gone wrong — before
          that the button alone is the whole story. */}
      {reason && (
        <div className="ar-bevel rounded-ar mt-5 w-full max-w-[19rem] p-4">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="border-ar-green/35 bg-ar-green/10 text-ar-green-hot flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border">
              {platform === "desktop" ? (
                <Settings size={12} strokeWidth={2.3} />
              ) : (
                <Smartphone size={12} strokeWidth={2.3} />
              )}
            </span>
            <h2 className="font-hud text-ar-dim text-[10px] font-semibold tracking-[0.16em] uppercase">
              {guide.title}
            </h2>
          </div>

          <ol className="space-y-2">
            {guide.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="font-hud text-ar-green mt-[1px] w-4 shrink-0 text-[10px] font-bold tabular-nums">
                  {i + 1}
                </span>
                <span className="text-ar-faint text-[12px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          {reason === "denied" && (
            <p className="border-ar-line text-ar-faint mt-3 border-t pt-3 text-[11.5px] leading-relaxed">
              Once a site is blocked, the browser stops asking — the button above can&rsquo;t
              re-prompt until you allow it in settings.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
