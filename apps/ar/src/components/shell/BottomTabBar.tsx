import { AnimatePresence, motion } from "framer-motion";
import { LayoutGrid, Map as MapIcon, Store, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "~/lib/navigation";
import { useState } from "react";

import { CameraLauncher } from "~/components/camera/CameraLauncher";
import { PackRing } from "~/components/murals/PackRing";

import { useBountyAttention } from "~/lib/ar/useBountyAttention";
import { cn } from "~/lib/utils";

type Tab = {
  href: string;
  label: string;
  icon: typeof MapIcon;
};

const LEFT: Tab[] = [
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/collection", label: "Collection", icon: LayoutGrid },
];

// Profile is not a tab — it's the avatar in each screen's header
// (`ProfileButton`), which freed this slot for Bounty.
const RIGHT: Tab[] = [
  { href: "/bounty", label: "Bounty", icon: Trophy },
  { href: "/brands", label: "Brands", icon: Store },
];

/**
 * ── BottomTabBar ───────────────────────────────────────────────────────────
 *
 * An edge-to-edge console, rounded along its top edge and flush with both
 * side edges and the true bottom of the screen — not a rounded pill floating
 * with a gap around it. The AR launcher breaks out of the top of it, raised on
 * its own plinth with a rotating conic ring, because it's the one action the
 * whole app exists to deliver and it should never look like a peer of "You".
 *
 * Used to be a floating pill with margin on all four sides. That margin was
 * never part of the bar — it was `<main>`'s own `pb-[80px]` reservation
 * (`AppShell.tsx`) showing through underneath: screen content stops above the
 * bar rather than scrolling under it, so there was never anything back there
 * to see, and the pill read as flat color around its edges no matter how it
 * was styled. Extending the bar to fill that whole reserved strip — corner to
 * corner, edge to the safe-area bottom — removes the gap rather than trying to
 * dress it up: everything inside the reservation is now the bar's own surface,
 * drawn once, instead of a floating shape over an exposed strip of page
 * background.
 *
 * The active plate is a shared `layoutId`, so switching tabs slides one lit
 * cap across the bar instead of cross-fading two.
 */
export function BottomTabBar() {
  const { pathname } = useRouter();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // QR is a mode of the same camera screen, reached from the AR tab.
  const arActive = isActive("/ar") || isActive("/scan");
  const { count: bountyAlerts } = useBountyAttention();
  // The AR button opens the camera launcher (AR · QR · Murals), same as the
  // mobile app, instead of going straight to /ar.
  const [launcherOpen, setLauncherOpen] = useState(false);

  return (
    <>
      <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-40">
        <div className="relative mx-auto w-full max-w-[420px]">
          {/* ── AR launcher ─────────────────────────────────────────────── */}
          <div className="pointer-events-auto absolute -top-[26px] left-1/2 z-10 -translate-x-1/2">
            <button
              type="button"
              onClick={() => setLauncherOpen(true)}
              aria-label="Open camera"
              aria-haspopup="dialog"
              aria-current={arActive ? "page" : undefined}
              className="group relative block h-[62px] w-[62px]"
            >
              {/* Expanding sonar pulse — only while AR is the live tab */}
              {arActive && (
                <span
                  aria-hidden
                  className="animate-pulse-ring absolute inset-0 rounded-full border border-ar-green-hot"
                />
              )}
              <span
                className={cn(
                  "ar-key ar-key-launcher absolute inset-0 flex items-center justify-center rounded-full",
                  arActive && "ar-glow",
                )}
              >
                {/* Spinning arc INSIDE the key, just within its border —
                    same as the mobile app (it used to be a halo outside). */}
                <span
                  aria-hidden
                  className={cn(
                    "ar-conic-ring ar-conic-ring-inner pointer-events-none absolute inset-[1.5px] rounded-full transition-opacity duration-300",
                    arActive
                      ? "opacity-100"
                      : "opacity-[0.85] group-hover:opacity-100",
                  )}
                />
                <ArGlyph active={arActive} />
              </span>
            </button>
            {/* Mural pack "charging" the camera while it downloads. A sibling,
                not a child: its % badge is its own button, and buttons can't
                nest. Overlaid on the 62px key above. */}
            <PackRing />
          </div>

          {/* ── The bar ─────────────────────────────────────────────────── */}
          {/* One element, rounded on top. `.ar-tabbar-surface` carries no
            `backdrop-filter` — see its doc comment in arcade.css for why, but
            in short: nothing scrolls behind this bar for a blur to act on, and
            WebKit refuses to clip a backdrop-filtered layer to a rounded
            corner (by its own radius *or* an ancestor's `overflow: hidden`),
            which is what was rendering these corners square.

            The safe-area inset lives in this element's own bottom padding
            rather than as margin outside it, so the surface runs flush to the
            true screen edge instead of floating above a gap. The tab row
            inside stays a fixed 64px tall regardless, so icons and labels
            don't drift toward whatever the safe-area measures on a given
            phone. */}
          <div
            className="ar-tabbar-surface pointer-events-auto relative rounded-t-ar-xl"
            style={{ paddingBottom: "max(12px, var(--ar-safe-bottom))" }}
          >
            <div className="flex h-[64px] items-stretch px-1.5">
              {LEFT.map((tab) => (
                <TabButton
                  key={tab.href}
                  tab={tab}
                  active={isActive(tab.href)}
                />
              ))}

              {/* Reserved footprint under the raised AR launcher. */}
              <div aria-hidden className="w-[74px] shrink-0" />

              {RIGHT.map((tab) => (
                <TabButton
                  key={tab.href}
                  tab={tab}
                  active={isActive(tab.href)}
                  dot={tab.href === "/bounty" && bountyAlerts > 0}
                />
              ))}
            </div>
          </div>
        </div>
      </nav>
      <CameraLauncher
        open={launcherOpen}
        onClose={() => setLauncherOpen(false)}
      />
    </>
  );
}

function TabButton({
  tab,
  active,
  dot = false,
}: {
  tab: Tab;
  active: boolean;
  /** Something behind this tab needs you — a win, a reply. */
  dot?: boolean;
}) {
  const Icon = tab.icon;

  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className="group relative flex flex-1 select-none flex-col items-center justify-center gap-[3px] rounded-ar"
    >
      {active && (
        <motion.span
          layoutId="tab-plate"
          aria-hidden
          className="bg-ar-green/12 absolute inset-x-1 inset-y-[7px] rounded-[13px] border border-ar-green/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_18px_-4px_hsl(var(--ar-green)/0.5)]"
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 38,
            mass: 0.7,
          }}
        />
      )}

      <motion.span
        animate={{ y: active ? -1 : 0, scale: active ? 1.06 : 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 26 }}
        className="relative z-10"
      >
        <Icon
          strokeWidth={active ? 2.4 : 1.9}
          className={cn(
            "h-[21px] w-[21px] transition-colors duration-200",
            active
              ? "text-ar-green-hot drop-shadow-[0_0_9px_hsl(var(--ar-green)/0.85)]"
              : "text-ar-faint group-hover:text-ar-dim",
          )}
        />
        {dot && (
          <span
            aria-hidden
            className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-ar-green-hot shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]"
          />
        )}
      </motion.span>

      <span
        className={cn(
          "font-hud relative z-10 text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-colors duration-200",
          active ? "text-ar-text" : "text-ar-faint group-hover:text-ar-dim",
        )}
      >
        {tab.label}
      </span>
    </Link>
  );
}

/**
 * The AR mark: viewfinder corners closing on the letters. Drawn rather than
 * imported so the corners can animate independently of the type.
 */
function ArGlyph({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-[30px] w-[30px] items-center justify-center">
      <AnimatePresence>
        <motion.svg
          key="corners"
          viewBox="0 0 30 30"
          fill="none"
          className="absolute inset-0"
          animate={{ scale: active ? [1, 0.9, 1] : 1 }}
          transition={{
            duration: 2.4,
            repeat: active ? Infinity : 0,
            ease: "easeInOut",
          }}
        >
          {[
            "M1 8V3.5A2.5 2.5 0 0 1 3.5 1H8",
            "M22 1h4.5A2.5 2.5 0 0 1 29 3.5V8",
            "M29 22v4.5a2.5 2.5 0 0 1-2.5 2.5H22",
            "M8 29H3.5A2.5 2.5 0 0 1 1 26.5V22",
          ].map((d) => (
            <path
              key={d}
              d={d}
              stroke="hsl(var(--ar-green-hot))"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          ))}
        </motion.svg>
      </AnimatePresence>
      <span className="font-hud text-[13px] font-bold leading-none tracking-tight text-ar-text drop-shadow-[0_0_8px_hsl(var(--ar-green)/0.9)]">
        AR
      </span>
    </span>
  );
}
