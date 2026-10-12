import {
  BadgeCheck,
  Check,
  Lock,
  TimerOff,
  Satellite,
  QrCode,
  Camera,
  RotateCw,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { AR_CAPTURE_RADIUS } from "~/lib/ar/geo";
import { pinStatus, RARITY_META } from "~/lib/ar/rarity";
import type { ArBrand, ArPin, DetectionMethod } from "~/lib/ar/types";
import { nonBlank } from "@wadzzo/utils/blank";
import { cn } from "@wadzzo/ui/lib/cn";
import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { platformBranding } from "@wadzzo/platform/branding";

const compact = (n: number) =>
  n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

/**
 * ── WadzzoCardBack ─────────────────────────────────────────────────────────
 *
 * Authentic Pokémon TCG-style card back, branded for Wadzzo.
 * Used for the card loading state and for 3D flip inspection.
 * Features the official Wadzzo logo from the public folder, with
 * concentric cyber-runic orbital rings, corner energy pips, and metallic foil.
 */
export function WadzzoCardBack({
  className,
  loading = false,
  pin,
}: {
  className?: string;
  loading?: boolean;
  pin?: ArPin;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[5/7] w-full overflow-hidden rounded-[inherit] select-none",
        "border-[6px] border-[#0c1f14] bg-[#05110a]",
        "shadow-[inset_0_0_24px_rgba(0,0,0,0.9),0_12px_32px_-8px_rgba(0,0,0,0.95)]",
        className,
      )}
    >
      {/* Cybernetic mesh & deep emerald background radial wash */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--ar-green)/0.28)_0%,hsl(var(--ar-void))_72%)] opacity-85" />
      <div className="ar-grid-fine absolute inset-0 opacity-30" />

      {/* Outer ornate border framing */}
      <div className="border-ar-green/35 absolute inset-2 rounded-[9px] border shadow-[0_0_10px_hsl(var(--ar-green)/0.2)]" />
      <div className="border-ar-green/15 absolute inset-3 rounded-[7px] border" />

      {/* Corner Energy Pips */}
      <span className="border-ar-green bg-ar-green-hot absolute top-3.5 left-3.5 h-2 w-2 rounded-full border shadow-[0_0_8px_hsl(var(--ar-green))]" />
      <span className="border-ar-green bg-ar-green-hot absolute top-3.5 right-3.5 h-2 w-2 rounded-full border shadow-[0_0_8px_hsl(var(--ar-green))]" />
      <span className="border-ar-green bg-ar-green-hot absolute bottom-3.5 left-3.5 h-2 w-2 rounded-full border shadow-[0_0_8px_hsl(var(--ar-green))]" />
      <span className="border-ar-green bg-ar-green-hot absolute right-3.5 bottom-3.5 h-2 w-2 rounded-full border shadow-[0_0_8px_hsl(var(--ar-green))]" />

      {/* Top Header Banner */}
      <div className="absolute inset-x-0 top-4 text-center">
        <span className="font-hud text-glow-soft text-ar-green-hot text-[11.5px] font-bold tracking-[0.38em] uppercase">
          W A D Z Z O
        </span>
      </div>

      {/* Center Medallion with Wadzzo Logo */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="border-ar-green/50 from-ar-surface-3 via-ar-surface to-ar-void relative flex h-[100px] w-[100px] items-center justify-center rounded-full border-2 bg-linear-to-br p-3 shadow-[0_0_24px_hsl(var(--ar-green)/0.4),inset_0_0_16px_rgba(0,0,0,0.85)]">
          {/* Animated orbiting rings */}
          <div
            className="border-ar-green/35 absolute inset-1 animate-spin rounded-full border border-dashed"
            style={{ animationDuration: "28s" }}
          />
          <div className="border-ar-green/25 absolute -inset-1.5 rounded-full border" />

          {/* Official Wadzzo Logo Mark from public folder */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={platformBranding.assets.mark}
            alt={platformBranding.name}
            className={cn(
              "relative z-10 h-14 w-14 object-contain drop-shadow-[0_0_12px_hsl(var(--ar-green)/0.8)]",
              loading && "animate-pulse",
            )}
          />
        </div>
      </div>

      {/* Bottom Footer Banner */}
      <div className="absolute inset-x-0 bottom-4 px-3 text-center">
        <span className="font-hud text-ar-dim block text-[8px] font-semibold tracking-[0.26em] uppercase">
          {loading ? "INITIALIZING HOLOGRAM…" : "AR COLLECTIBLE"}
        </span>
        {pin ? (
          <p className="font-hud text-ar-faint mt-0.5 text-[7px] tracking-[0.16em] uppercase">
            STELLAR • SOROBAN VERIFIED
          </p>
        ) : (
          <p className="font-hud text-ar-faint mt-0.5 text-[7px] tracking-[0.16em] uppercase">
            COLLECT THE REAL WORLD
          </p>
        )}
      </div>

      {/* Shimmer sweep animation when in loading state */}
      {loading && (
        <div className="via-ar-green/20 pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-linear-to-r from-transparent to-transparent" />
      )}

      {/* Dynamic specular glare over the card back */}
      <span className="holo__glare" aria-hidden />
    </div>
  );
}

/**
 * ── HoloCard ───────────────────────────────────────────────────────────────
 *
 * A collected pin rendered in the Pokémon TCG (Trading Card Game) style,
 * driven by Simon Goellner's multi-layered holographic foil techniques.
 *
 * Supports:
 * - 3D parallax tilt (pointer & touch driven)
 * - Authentic Pokémon TCG frame, art box, moves/ability text box, and footer
 * - Loading state with Wadzzo Card Back and Wadzzo logo from public folder
 * - Interactive 3D card flip between Front and Back
 */
export function HoloCard({
  pin,
  brand,
  creatorBack = false,
  interactive = false,
  onClick,
  className,
  priority,
  showFlipButton = false,
  oneFace = false,
  isFlipped: controlledFlipped,
  onFlip,
}: {
  pin: ArPin;
  brand?: ArBrand | null;
  /**
   * Put the creator/trainer card on the *back* face, so the front stays the
   * drop itself. A physical trading card works this way round: the face is
   * the thing you pulled, and who issued it is on the reverse.
   */
  creatorBack?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  className?: string;
  priority?: boolean;
  showFlipButton?: boolean;
  /**
   * Render the front and nothing else — no back face, no flip, no card-back
   * loading state. For browse rails, where the card is a link to somewhere
   * else rather than an object to inspect: flipping it there has nothing to
   * reveal, and the seal that stands in while art loads just reads as every
   * card in the row briefly being the wrong card.
   */
  oneFace?: boolean;
  isFlipped?: boolean;
  onFlip?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const rarity = pin.rarity;
  const status = pinStatus(pin);
  const spent = status === "expired" || (pin.collected && pin.isRedeemed === true);
  const meta = RARITY_META[rarity];

  // Loading state: starts true, flips to false when card art loads or timeout passes
  const [isLoaded, setIsLoaded] = useState(false);
  const [internalFlipped, setInternalFlipped] = useState(false);

  const flipped = controlledFlipped ?? internalFlipped;

  useEffect(() => {
    // Safety fallback: if image caching or slow network delays, reveal after 1.4s
    const timer = setTimeout(() => setIsLoaded(true), 1400);
    return () => clearTimeout(timer);
  }, []);

  const toggleFlip = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (onFlip) {
        onFlip();
      } else {
        setInternalFlipped((f) => !f);
      }
    },
    [onFlip],
  );

  const maxTilt = interactive ? 16 : 8;

  const track = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      if (frame.current) cancelAnimationFrame(frame.current);

      frame.current = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const px = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
        const py = Math.min(Math.max((clientY - r.top) / r.height, 0), 1);

        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
        el.style.setProperty("--pointer-x", `${px * 100}%`);
        el.style.setProperty("--pointer-y", `${py * 100}%`);
        el.style.setProperty("--pointer-from-top", `${py}`);
        el.style.setProperty("--pointer-from-left", `${px}`);
        el.style.setProperty(
          "--pointer-from-center",
          `${Math.min(Math.hypot(px - 0.5, py - 0.5) * 2, 1)}`,
        );

        // Simon Goellner's foil depth calculations:
        el.style.setProperty("--pos", `${50 + (0.5 - px) * 140}% ${50 + (0.5 - py) * 140}%`);
        el.style.setProperty("--background-x", `${37 + px * 26}%`);
        el.style.setProperty("--background-y", `${33 + py * 34}%`);

        el.style.setProperty("--rx", `${(0.5 - py) * maxTilt * 2}deg`);
        el.style.setProperty("--ry", `${(px - 0.5) * maxTilt * 2}deg`);
        el.classList.add("is-interacting");
      });
    },
    [maxTilt],
  );

  const reset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.style.setProperty("--mx", "50%");
    el.style.setProperty("--my", "50%");
    el.style.setProperty("--pointer-x", "50%");
    el.style.setProperty("--pointer-y", "50%");
    el.style.setProperty("--pos", "50% 50%");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.classList.remove("is-interacting");
  }, []);

  const Tag = onClick ? "button" : "div";

  // Serial out of supply calculation
  const serial =
    pin.supply != null
      ? (Array.from(pin.id).reduce((a, c) => a + c.charCodeAt(0), 0) % pin.supply) + 1
      : null;

  return (
    <div
      className={cn(
        "tcg-card relative",
        // `is-loading` parks the rotator at 180deg to show the card back —
        // meaningless when there is no back face to park on.
        !isLoaded && !oneFace && "is-loading",
        className,
      )}
      data-flipped={flipped ? "true" : undefined}
      onPointerMove={(e) => track(e.clientX, e.clientY)}
      onPointerLeave={reset}
      style={{
        // The drop-shadow glow lives here, on the element *outside* the 3D
        // rotation, rather than on `.holo` below — Safari doesn't reliably
        // clip a box-shadow to border-radius on an element that itself has
        // an active 3D transform (see the note on `.holo`'s `border` below
        // for the same failure mode), and this element never rotates, so a
        // shadow here is never at risk of it.
        boxShadow: spent
          ? "0 8px 24px -12px rgba(0,0,0,0.9)"
          : `0 10px 30px -10px hsl(${meta.hsl} / 0.6), 0 20px 45px -20px rgba(0,0,0,0.95)`,
      }}
    >
      <Tag
        onClick={onClick}
        className={cn(
          "holo group block w-full text-left",
          "rounded-[inherit] transition-colors duration-300",
          "focus-visible:ring-ar-green focus-visible:ring-offset-ar-bg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        )}
        data-rarity={rarity}
        data-spent={spent || undefined}
        ref={ref as never}
        style={
          {
            "--mx": "50%",
            "--my": "50%",
            "--pos": "50% 50%",
            "--rx": "0deg",
            "--ry": "0deg",
            transform: "rotateX(var(--rx)) rotateY(var(--ry)) translateZ(0)",
            transformStyle: "preserve-3d",
            transition: "transform 220ms cubic-bezier(0.2,0.8,0.2,1), border-color 220ms",
            // The rarity ring used to be the first segment of this element's
            // own box-shadow (`0 0 0 1.5px ...`). Safari stops honouring
            // border-radius on a box-shadow once the element it's on has an
            // active 3D transform — this one always does (`transform` above
            // is never "none", even at rest), which is why the ring (and,
            // it turns out, the glow that used to sit right here too)
            // rendered with square corners. A real `border` doesn't have
            // that failure mode: it's painted as part of the box itself, so
            // it always follows border-radius regardless of any transform.
            border: spent ? "1.5px solid transparent" : `1.5px solid hsl(${meta.hsl} / 0.45)`,
          } as React.CSSProperties
        }
      >
        {/* ── 3D Rotator Face Container (Front & Back) ──────────────── */}
        <div
          className="tcg-card__rotator relative aspect-[5/7] w-full"
          style={
            oneFace
              ? undefined
              : {
                  transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  transition: "transform 0.65s cubic-bezier(0.2, 0.8, 0.2, 1)",
                }
          }
        >
          {/* ════ 1. BACK FACE ════
              The creator card where one was asked for, the Wadzzo seal
              otherwise. The seal doubles as the loading state (see
              `.tcg-card.is-loading` in arcade.css, which parks the rotator
              at 180deg), which is why it stays the default: a half-drawn
              creator card is a worse "not ready yet" than a plain back.

              Skipped entirely in `oneFace` mode — a browse rail wants a
              stack of card fronts, and rendering a back at all is what put
              the Wadzzo seal on screen for the first beat of every card
              while its art loaded. */}
          {!oneFace && (
            <div className="tcg-card__face tcg-card__back">
              {creatorBack && isLoaded ? (
                <PokemonTcgCreatorFront pin={pin} brand={brand} priority={priority} />
              ) : (
                <WadzzoCardBack loading={!isLoaded} pin={pin} />
              )}
            </div>
          )}

          {/* ════ 2. FRONT FACE: THE DROP ITSELF ════ */}
          <div className="tcg-card__face tcg-card__front">
            <PokemonTcgFront
              pin={pin}
              interactive={interactive}
              spent={spent}
              serial={serial}
              meta={meta}
              status={status}
              priority={priority}
              onImageLoaded={() => setIsLoaded(true)}
            />
          </div>
        </div>
      </Tag>

      {/* Optional flip button on the showcase card.
          Parked outside the card's own box, in the top-right corner gap —
          every in-card position (bottom-right footer, right-edge mid-height)
          has ended up under real card content at some point, because the
          card's own layout keeps changing what lives at its edges. A corner
          outside the card entirely is the only spot immune to that: nothing
          the card renders can ever grow into the margin around it. */}
      {!oneFace && (showFlipButton || interactive) && (
        <button
          type="button"
          onClick={toggleFlip}
          aria-label={
            flipped
              ? "Show the front"
              : creatorBack
                ? "Show the creator on the back"
                : "Show the back"
          }
          className="ar-glass text-ar-dim absolute -top-3 -right-3 z-30 flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold shadow-md transition-transform active:scale-95"
        >
          <RotateCw size={11} strokeWidth={2.4} />
          <span className="font-hud tracking-[0.1em] uppercase">
            {flipped ? "Front" : creatorBack ? "Creator" : "Back"}
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * ── Shared card anatomy ────────────────────────────────────────────────────
 *
 * The front (a drop) and the back (its creator) show completely different
 * data, but they're two faces of *one card* — so they share one skeleton:
 * name row, art, a thin subtitle line, attack-style ability rows, a footer
 * stat strip. These three are that shared skeleton's leaf pieces. Real
 * trading-card DNA, not a stack of boxed panels: only the art itself gets a
 * border anywhere on the card.
 */

function TcgName({
  eyebrow,
  title,
  accent,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  /** hsl() color-function body, e.g. `var(--rarity-epic)` or `142 70% 45%`. */
  accent: string;
  icon: LucideIcon;
}) {
  return (
    <div className="tcg-name">
      <div className="min-w-0 flex-1">
        <span className="tcg-name__eyebrow font-hud text-ar-faint block font-semibold uppercase">
          {eyebrow}
        </span>
        <h3 className="tcg-name__title font-hud text-ar-text truncate font-bold">{title}</h3>
      </div>
      <span
        className="tcg-name__badge flex shrink-0 items-center justify-center rounded-full border"
        style={{
          borderColor: `hsl(${accent} / 0.6)`,
          backgroundColor: `hsl(${accent} / 0.18)`,
          color: `hsl(${accent})`,
        }}
      >
        <Icon className="h-[55%] w-[55%]" strokeWidth={2.6} />
      </span>
    </div>
  );
}

/**
 * A pill overlapping the art's bottom edge — rarity/status on the left,
 * a second fact (claim method, category) on the right, same row. Filled
 * (solid `bg`) for the primary fact, outlined (void `bg`, coloured `fg`)
 * for the secondary one, so the two read as a pair without competing.
 */
function TcgArtChip({
  align = "start",
  bg,
  fg,
  children,
}: {
  align?: "start" | "end";
  bg: string;
  fg: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "tcg-art__chip font-hud font-bold uppercase",
        align === "end" && "tcg-art__chip--end",
      )}
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

/** The card's one paragraph of real copy. Cropped, never pushed off-card. */
function TcgDescription({ children }: { children: ReactNode }) {
  return <p className="tcg-description text-ar-dim line-clamp-3">{children}</p>;
}

function TcgFooter({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="tcg-footer">
      <span className="tcg-footer__item">{left}</span>
      <span className="tcg-footer__item">{center}</span>
      <span className="tcg-footer__item tcg-footer__item--end">{right}</span>
    </div>
  );
}

/**
 * ── PokemonTcgCreatorFront ────────────────────────────────────────────────
 *
 * The back face: who issued the drop. Same anatomy as the front —
 * `TcgName` / art / `TcgSubline`-shaped ribbon / `TcgAbilityRow`s /
 * `TcgFooter` — so flipping the card reads as turning it over, not as
 * switching to a different screen.
 *
 *   Name row      Creator name, "TRAINER" eyebrow, verified badge in place
 *                 of the front's detection-method badge.
 *   Art           The creator's own avatar, full-bleed — not a small
 *                 medallion floating over a blurred cover photo. Two chips
 *                 overlap its bottom edge, mirroring the front's rarity +
 *                 claim-method pair: verified/creator status on the left,
 *                 category or region on the right.
 *   Creator name  @handle, on its own line — nothing competing with it.
 *   Description   The creator's bio, cropped rather than pushed off-card.
 *   Footer        Live drop count · follower count · the Wadzzo credit
 *                 line — real numbers, not a repeat of the art chips.
 */
function PokemonTcgCreatorFront({
  pin,
  brand,
  priority,
  onImageLoaded,
}: {
  pin: ArPin;
  brand?: ArBrand | null;
  priority?: boolean;
  /**
   * Optional: only the *front* face gates the card's loading state on its art
   * arriving. On the back this renders behind an already-revealed card, so
   * there's nothing left to wait for.
   */
  onImageLoaded?: () => void;
}) {
  const creatorName = brand?.name ?? pin.brandName;
  const avatarUrl = brand?.avatarUrl ?? pin.brandImageUrl;
  const handle = brand?.handle ? `@${brand.handle}` : "@creator";
  const origin =
    nonBlank(brand?.categories?.slice(0, 2).join(" • ")) ??
    nonBlank(brand?.region) ??
    "Stellar creator";
  const bio =
    nonBlank(brand?.bio) ??
    nonBlank(brand?.tagline) ??
    `Official ${platformBranding.name} creator placing drops in the real world.`;
  const followersCount = brand?.followers ?? 0;
  const dropsCount = brand?.pinCount ?? 1;
  const verified = brand?.verified ?? false;
  const accent = "var(--ar-green)";

  return (
    <div
      className={cn(
        "tcg-face relative flex h-full w-full flex-col overflow-hidden",
        "border-[5px] select-none",
      )}
      style={{
        borderColor: platformBranding.colors.cardBorder,
        boxShadow: `0 0 18px ${platformBranding.colors.cardGlow}`,
        background: `radial-gradient(130% 100% at 50% 0%, hsl(${accent}/0.24) 0%, hsl(var(--ar-surface-2)) 60%, hsl(var(--ar-void)) 100%)`,
      }}
    >
      <TcgName
        eyebrow="Trainer &bull; Creator"
        title={creatorName}
        accent={accent}
        icon={verified ? BadgeCheck : Users}
      />

      <div className="tcg-art">
        <div className="tcg-art__frame aspect-[5/4]">
          <BrandAvatar
            src={avatarUrl}
            alt={creatorName}
            loading={priority ? "eager" : "lazy"}
            onLoad={onImageLoaded}
            className="absolute inset-0 h-full w-full"
          />
          <span className="pointer-events-none absolute inset-0 ring-1 ring-white/15 ring-inset" />

          <div className="tcg-art__overlay">
            <span className="tcg-art__overlay-title font-hud line-clamp-2 font-bold text-white">
              {creatorName}
            </span>
            <span className="tcg-art__overlay-brand font-hud truncate font-semibold text-white/65 uppercase">
              {handle}
            </span>
          </div>
        </div>

        <TcgArtChip
          bg={verified ? `hsl(${accent})` : "hsl(var(--ar-void))"}
          fg={verified ? "hsl(var(--ar-void))" : "hsl(var(--ar-text-faint))"}
        >
          {verified ? (
            <BadgeCheck className="h-[3.4cqw] w-[3.4cqw] shrink-0" strokeWidth={2.8} />
          ) : (
            <Users className="h-[3.4cqw] w-[3.4cqw] shrink-0" strokeWidth={2.8} />
          )}
          <span className="min-w-0 truncate">{verified ? "Verified" : "Creator"}</span>
        </TcgArtChip>
        <TcgArtChip align="end" bg="hsl(var(--ar-void))" fg={`hsl(${accent})`}>
          <span className="min-w-0 truncate">{origin}</span>
        </TcgArtChip>
      </div>

      <div className="tcg-subline">
        <span className="font-hud text-ar-text truncate font-semibold tracking-[0.12em] uppercase">
          {handle}
        </span>
      </div>

      <TcgDescription>{bio}</TcgDescription>

      <TcgFooter
        left={
          <>
            <span
              className="flex h-[5.6cqw] w-[5.6cqw] items-center justify-center rounded-full"
              style={{
                backgroundColor: `hsl(${accent}/0.22)`,
                color: `hsl(${accent})`,
              }}
            >
              <Sparkles className="h-[65%] w-[65%]" strokeWidth={2.8} />
            </span>
            <span className="font-hud text-ar-text font-bold uppercase">
              {dropsCount} {dropsCount === 1 ? "drop" : "drops"}
            </span>
          </>
        }
        center={
          <span className="font-hud text-ar-dim truncate font-semibold">
            {compact(followersCount)} followers
          </span>
        }
        right={
          <span className="font-hud text-ar-faint font-bold tracking-[0.14em] uppercase">
            {platformBranding.name} &bull; AR
          </span>
        }
      />
    </div>
  );
}

/**
 * ── PokemonTcgFront ────────────────────────────────────────────────────────
 *
 * The front face: the drop itself.
 *
 *   Name row      The drop's title, a "Basic/Auto AR Drop" eyebrow, and a
 *                 badge carrying the detection method — the same slot the
 *                 back uses for its verified mark.
 *   Art           The drop's own art, full-bleed behind a single hairline
 *                 border, with the holo foil confined to *this* box (real
 *                 foil coats the illustration, not the whole card). A state
 *                 stamp (collected/expired/locked) sits in the corner when
 *                 relevant. Two chips overlap its bottom edge: rarity on the
 *                 left, how you get it (auto-collect / capture radius) on
 *                 the right — the same row, same weight.
 *   Creator name  Brand avatar + name, on its own line.
 *   Description   The drop's own description, cropped rather than pushed
 *                 off-card.
 *   Footer        Claim status (collected / available / locked / expired) ·
 *                 serial number · a redemption code or lock reason when
 *                 there is one, the Wadzzo credit line otherwise.
 */
function PokemonTcgFront({
  pin,
  interactive,
  spent,
  serial,
  meta,
  status,
  priority,
  onImageLoaded,
}: {
  pin: ArPin;
  interactive: boolean;
  spent: boolean;
  serial: number | null;
  meta: { label: string; short: string; hsl: string };
  status: string;
  priority?: boolean;
  onImageLoaded: () => void;
}) {
  const DetectionIcon = getDetectionIcon(pin.detection);
  const serialLabel = `№ ${serial ? String(serial).padStart(3, "0") : "001"}/${pin.supply ?? "∞"}`;

  const footerStatus =
    status === "locked"
      ? { Icon: Lock, label: "Locked", accent: "var(--ar-text-faint)" }
      : status === "expired"
        ? { Icon: TimerOff, label: "Expired", accent: "var(--ar-danger)" }
        : pin.collected
          ? { Icon: Check, label: "Collected", accent: "var(--ar-green-hot)" }
          : {
              Icon: Sparkles,
              label: "Available",
              accent: "var(--ar-text-dim)",
            };
  const FooterStatusIcon = footerStatus.Icon;

  return (
    <div
      className={cn(
        "tcg-face relative flex h-full w-full flex-col overflow-hidden",
        "border-[5px] select-none",
        getFrameBorderClasses(pin.rarity),
      )}
      style={{
        background: `radial-gradient(130% 100% at 50% 0%, hsl(${meta.hsl} / 0.22) 0%, hsl(var(--ar-surface-2)) 60%, hsl(var(--ar-void)) 100%)`,
      }}
    >
      <TcgName
        eyebrow={pin.autoCollect ? "Auto AR Drop" : "Basic AR Drop"}
        title={pin.title}
        accent={meta.hsl}
        icon={DetectionIcon}
      />

      <div className="tcg-art">
        <div className={cn("tcg-art__frame", interactive ? "aspect-[16/11]" : "aspect-[5/4]")}>
          <CardArt
            src={pin.imageUrl}
            alt={pin.title}
            title={pin.title}
            rarity={meta.hsl}
            dimmed={spent}
            priority={priority}
            onLoad={onImageLoaded}
          />

          {(pin.collected || status === "expired" || status === "locked") && (
            <div className="absolute top-[2.4cqw] right-[2.4cqw] z-10">
              <StateStamp
                kind={
                  status === "locked" ? "locked" : status === "expired" ? "expired" : "collected"
                }
              />
            </div>
          )}

          <span className="pointer-events-none absolute inset-0 ring-1 ring-white/15 ring-inset" />

          <div className="tcg-art__overlay">
            <span className="tcg-art__overlay-title font-hud line-clamp-2 font-bold text-white">
              {pin.title}
            </span>
            <span className="tcg-art__overlay-brand font-hud truncate font-semibold text-white/65 uppercase">
              {pin.brandName}
            </span>
          </div>

          {/* Simon Goellner Holographic Foil Stack — confined to the art
              frame's own clipped bounds, so it coats the illustration the
              way real card foil does, instead of washing out the name,
              description and footer text underneath it on hover/tilt. */}
          <span className="holo__foil" aria-hidden />
          <span className="holo__sparkle" aria-hidden />
          <span className="holo__glare" aria-hidden />
        </div>

        <TcgArtChip bg={`hsl(${meta.hsl})`} fg="hsl(var(--ar-void))">
          {meta.short}
          <span className="opacity-80">{meta.label}</span>
        </TcgArtChip>
        <TcgArtChip align="end" bg="hsl(var(--ar-void))" fg={`hsl(${meta.hsl})`}>
          <DetectionIcon className="h-[3.4cqw] w-[3.4cqw] shrink-0" strokeWidth={2.8} />
          <span className="min-w-0 truncate">
            {pin.autoCollect ? "Auto" : `${AR_CAPTURE_RADIUS}m`}
          </span>
        </TcgArtChip>
      </div>

      <div className="tcg-subline">
        <span className="flex min-w-0 items-center gap-[1.4cqw]">
          <span className="tcg-subline__avatar shrink-0 overflow-hidden rounded-full ring-1 ring-white/25">
            <BrandAvatar src={pin.brandImageUrl} className="h-full w-full" />
          </span>
          <span className="font-hud text-ar-text truncate font-semibold tracking-[0.12em] uppercase">
            {pin.brandName}
          </span>
        </span>
      </div>

      <TcgDescription>{pin.description}</TcgDescription>

      <TcgFooter
        left={
          <>
            <span
              className="flex h-[5.6cqw] w-[5.6cqw] items-center justify-center rounded-full"
              style={{
                backgroundColor: `hsl(${footerStatus.accent}/0.22)`,
                color: `hsl(${footerStatus.accent})`,
              }}
            >
              <FooterStatusIcon className="h-[65%] w-[65%]" strokeWidth={2.8} />
            </span>
            <span className="font-hud text-ar-text font-bold uppercase">{footerStatus.label}</span>
          </>
        }
        center={
          <span className="font-hud text-ar-dim truncate font-semibold tabular-nums">
            {serialLabel}
          </span>
        }
        right={
          pin.redeemCode ? (
            <span className="font-hud text-ar-green-hot truncate font-bold tracking-[0.08em] uppercase">
              Code {pin.redeemCode}
            </span>
          ) : pin.locked && pin.lockReason ? (
            <span className="font-hud text-ar-faint truncate font-semibold">{pin.lockReason}</span>
          ) : (
            <span className="font-hud text-ar-faint font-bold tracking-[0.14em] uppercase">
              {platformBranding.name} &bull; AR
            </span>
          )
        }
      />
    </div>
  );
}

/**
 * Maps rarity to Pokémon TCG-style frame borders.
 */
function getFrameBorderClasses(rarity: string) {
  switch (rarity) {
    case "rare":
      return "border-[#1a4a63] shadow-[0_0_12px_rgba(14,165,233,0.35)]";
    case "epic":
      return "border-[#5b2478] shadow-[0_0_15px_rgba(168,85,247,0.4)]";
    case "legendary":
      return "border-[#967018] shadow-[0_0_18px_rgba(245,158,11,0.5)]";
    case "mythic":
      return "border-[#96236b] shadow-[0_0_22px_rgba(236,72,153,0.6)]";
    case "common":
    default:
      return "border-[#25322b] shadow-[0_0_10px_rgba(0,0,0,0.6)]";
  }
}

function getDetectionIcon(method: DetectionMethod) {
  switch (method) {
    case "qr":
      return QrCode;
    case "image":
      return Camera;
    case "gps":
    default:
      return Satellite;
  }
}

/**
 * Procedural fallback for card art.
 */
function CardArt({
  src,
  alt,
  title,
  rarity,
  dimmed,
  priority,
  onLoad,
}: {
  src: string;
  alt: string;
  title: string;
  rarity: string;
  dimmed?: boolean;
  priority?: boolean;
  onLoad?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="ar-grid-fine absolute inset-0 flex items-center justify-center"
        style={{
          background: `radial-gradient(120% 90% at 50% 25%, hsl(${rarity} / 0.35), hsl(var(--ar-surface)) 70%)`,
        }}
      >
        <span
          className="font-hud text-[56px] leading-none font-bold opacity-35"
          style={{ color: `hsl(${rarity})` }}
        >
          {title.trim().charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onLoad={onLoad}
      onError={() => {
        setFailed(true);
        onLoad?.();
      }}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn(
        "absolute inset-0 h-full w-full object-cover transition-[filter] duration-300",
        dimmed && "brightness-[0.55] grayscale-[0.75]",
      )}
    />
  );
}

function StateStamp({ kind }: { kind: "collected" | "expired" | "locked" }) {
  const map = {
    collected: {
      Icon: Check,
      cls: "border-rarity-legendary/70 bg-rarity-legendary/20 text-rarity-legendary",
    },
    expired: {
      Icon: TimerOff,
      cls: "border-ar-danger/60 bg-ar-danger/20 text-ar-danger",
    },
    locked: {
      Icon: Lock,
      cls: "border-ar-line-bright bg-ar-void/70 text-ar-faint",
    },
  }[kind];

  const { Icon, cls } = map;
  return (
    <span
      className={cn(
        "flex h-[20px] w-[20px] items-center justify-center rounded-full border backdrop-blur-xs",
        cls,
      )}
      aria-label={kind}
    >
      <Icon size={11} strokeWidth={3} />
    </span>
  );
}
