import { type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { BottomTabBar } from "./BottomTabBar";
import { StatusBar } from "./StatusBar";

/**
 * The inside of the device: a simulated status bar, one screen, and the tab
 * console. Screens own their own scrolling — `AppShell` never scrolls, so the
 * tab bar can't drift and a long collection can't push the console off-frame.
 */
export function AppShell({
  children,
  tabs = true,
  /** AR and the boot sequence paint to the very edges, status bar included. */
  bleed = false,
}: {
  children: ReactNode;
  tabs?: boolean;
  bleed?: boolean;
}) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {!bleed && <StatusBar />}

      <main
        className={cn(
          "relative flex-1 overflow-hidden",
          // Leave room for the console plus the raised AR launcher above it.
          tabs && "pb-[80px] ",
        )}
      >
        {children}
      </main>

      {tabs && <BottomTabBar />}
    </div>
  );
}

/**
 * Standard screen header: title, optional eyebrow, optional trailing slot.
 * Sits above a scroll pane and does not scroll with it, so the screen you're
 * on is always named even three hundred cards down.
 */
export function ScreenHeader({
  eyebrow,
  title,
  trailing,
  className,
}: {
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative z-20 flex items-end justify-between gap-3 px-5 pb-4",
        className,
      )}
      style={{ paddingTop: "calc(var(--ar-top-inset) + 16px)" }}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-hud mb-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-ar-green">
            {eyebrow}
          </p>
        )}
        <h1 className="font-hud truncate text-[26px] font-bold leading-none tracking-tight text-ar-text">
          {title}
        </h1>
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </header>
  );
}
