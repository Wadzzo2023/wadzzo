import { cn } from "../lib/cn";

/**
 * The raised "Go to AR" key in the middle of the phone tab bar (market and brand), after the AR
 * app's own launcher: an ink disc lifted out of the bar, viewfinder corners closing on "AR", a
 * spinning arc inside its rim. It hops and pings for about a second every ~5.5s so it gets
 * noticed, and stays still for people who prefer reduced motion.
 *
 * Opens the AR web app in the same tab. Render it inside a `side-scope` bar: it takes the
 * sidebar colours.
 */
export function ArTabButton({ href, className }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      aria-label="Go to AR"
      title="Go to AR"
      className={cn(
        "group flex h-12 min-w-0 flex-1 items-center justify-center select-none",
        className,
      )}
    >
      <span className="relative block size-[60px] shrink-0 -translate-y-4">
        {/* sonar ring, out with each hop */}
        <span
          aria-hidden
          className="ar-tab-motion bg-side-ink/50 absolute inset-0 animate-[ar-ping_5.5s_ease-out_1.2s_infinite] rounded-full"
        />
        <span className="ar-tab-motion bg-side-ink text-side ring-side relative flex size-full animate-[ar-hop_5.5s_ease-in-out_1.2s_infinite] items-center justify-center rounded-full shadow-[0_10px_22px_-8px_hsl(0_0%_0%/0.65)] ring-4 transition-transform duration-200 group-active:scale-95">
          {/* the spinning arc, just inside the rim */}
          <span
            aria-hidden
            className="ar-tab-motion absolute inset-[3px] animate-[ar-spin_2.8s_linear_infinite] rounded-full [background:conic-gradient(from_0deg,transparent_0_62%,currentColor_100%)] [mask:radial-gradient(farthest-side,transparent_calc(100%-2.5px),#000_calc(100%-2px))]"
          />
          <span className="relative flex size-[30px] items-center justify-center">
            <svg aria-hidden viewBox="0 0 30 30" fill="none" className="absolute inset-0">
              {[
                "M1 8V3.5A2.5 2.5 0 0 1 3.5 1H8",
                "M22 1h4.5A2.5 2.5 0 0 1 29 3.5V8",
                "M29 22v4.5a2.5 2.5 0 0 1-2.5 2.5H22",
                "M8 29H3.5A2.5 2.5 0 0 1 1 26.5V22",
              ].map((d) => (
                <path key={d} d={d} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              ))}
            </svg>
            <span className="display text-[17px] leading-none">AR</span>
          </span>
        </span>
      </span>
    </a>
  );
}
