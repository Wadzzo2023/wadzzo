import { motion } from "framer-motion";
import { Check, Lock, Zap } from "lucide-react";
import { useState } from "react";

import { pinStatus, RARITY_META } from "~/lib/ar/rarity";
import type { ArPin } from "~/lib/ar/types";
import { cn } from "~/lib/utils";

/**
 * ── PinMarker ──────────────────────────────────────────────────────────────
 *
 * A hex medallion carrying the brand's mark, ringed in its rarity colour and
 * standing on a ground shadow so it reads as an object placed on the map
 * rather than a dot drawn onto it.
 *
 * Four states are legible at a glance without tapping anything:
 *   in range + claimable  full colour, sonar ring, floating
 *   out of range          same medallion, dimmed and grounded
 *   collected             desaturated with a gold tick
 *   locked / dead         flattened, padlock or no ring at all
 *
 * `inRange` is passed in rather than computed here because the map already
 * knows the distance to every pin and recomputing per marker per frame would
 * be the single most expensive thing on the screen.
 */
export function PinMarker({
  pin,
  selected,
  inRange,
  onSelect,
}: {
  pin: ArPin;
  selected: boolean;
  inRange: boolean;
  onSelect: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const rarity = pin.rarity;
  const status = pinStatus(pin);
  const meta = RARITY_META[rarity];

  const live = status === "collectible";
  const dead = status === "expired" || status === "depleted";
  const ring = dead ? "var(--ar-locked)" : meta.hsl;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      aria-label={`${pin.title} — ${pin.brandName}`}
      className="group relative flex h-[58px] w-[52px] cursor-pointer items-start justify-center focus-visible:outline-none"
    >
      {/* Ground shadow. Tightens when the medallion is grounded (out of
          range), which is what sells the height difference. */}
      <span
        aria-hidden
        className={cn(
          "absolute bottom-[2px] left-1/2 h-[5px] -translate-x-1/2 rounded-[50%] bg-black/60 blur-[3px] transition-all",
          inRange && live ? "w-[22px] opacity-50" : "w-[28px] opacity-75",
        )}
      />

      <motion.span
        className="relative block"
        animate={
          inRange && live
            ? { y: [0, -5, 0] }
            : { y: 0 }
        }
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        whileTap={{ scale: 0.9 }}
      >
        {/* Sonar — only for something you can actually capture right now. */}
        {live && inRange && (
          <>
            <span
              aria-hidden
              className="animate-pulse-ring absolute inset-0 rounded-[14px] border-2"
              style={{ borderColor: `hsl(${meta.hsl})` }}
            />
            <span
              aria-hidden
              className="animate-pulse-ring absolute inset-0 rounded-[14px] border"
              style={{ borderColor: `hsl(${meta.hsl})`, animationDelay: "1.1s" }}
            />
          </>
        )}

        {/* Medallion */}
        <motion.span
          animate={{ scale: selected ? 1.22 : 1 }}
          transition={{ type: "spring", stiffness: 480, damping: 24 }}
          className={cn(
            "relative flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border-2 transition-opacity",
            !live && "opacity-75",
            dead && "opacity-45 saturate-0",
          )}
          style={{
            borderColor: `hsl(${ring})`,
            background: `linear-gradient(180deg, hsl(var(--ar-surface-3)), hsl(var(--ar-void)))`,
            boxShadow: selected
              ? `0 0 0 3px hsl(${ring} / 0.3), 0 0 26px -2px hsl(${ring} / 0.95)`
              : live
                ? `0 0 16px -3px hsl(${ring} / 0.8)`
                : "0 4px 10px -4px rgba(0,0,0,0.9)",
          }}
        >
          {failed ? (
            <span
              className="font-hud text-[15px] font-bold"
              style={{ color: `hsl(${ring})` }}
            >
              {pin.brandName.charAt(0)}
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pin.brandImageUrl}
              alt=""
              onError={() => setFailed(true)}
              loading="lazy"
              className={cn(
                "h-[30px] w-[30px] rounded-[9px] object-cover",
                status === "collected" && "opacity-45 saturate-0",
              )}
            />
          )}

          {/* Corner flag */}
          {status === "collected" && <CornerFlag tone="gold" Icon={Check} />}
          {status === "locked" && <CornerFlag tone="muted" Icon={Lock} />}
          {live && pin.autoCollect && <CornerFlag tone="green" Icon={Zap} />}
        </motion.span>

        {/* Stem — the medallion stands on a point, like a map pin should. */}
        <span
          aria-hidden
          className="absolute -bottom-[5px] left-1/2 h-[9px] w-[2px] -translate-x-1/2 rounded-full"
          style={{
            background: `linear-gradient(180deg, hsl(${ring}), transparent)`,
            opacity: dead ? 0.3 : 0.85,
          }}
        />
      </motion.span>
    </button>
  );
}

function CornerFlag({
  tone,
  Icon,
}: {
  tone: "gold" | "green" | "muted";
  Icon: typeof Check;
}) {
  const cls = {
    gold: "bg-rarity-legendary text-[hsl(30_90%_10%)]",
    green: "bg-ar-green text-ar-green-ink",
    muted: "bg-ar-surface-3 text-ar-faint border border-ar-line-bright",
  }[tone];

  return (
    <span
      className={cn(
        "absolute -right-[5px] -top-[5px] flex h-[17px] w-[17px] items-center justify-center rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.8)]",
        cls,
      )}
    >
      <Icon size={10} strokeWidth={3.4} />
    </span>
  );
}
