import { ChevronLeft } from "lucide-react";
import { useRouter } from "~/lib/navigation";
import { type ReactNode } from "react";

import { cn } from "@wadzzo/ui/lib/cn";
import { BottomTabBar } from "./BottomTabBar";
import { ProfileButton } from "./ProfileButton";
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
          // Content runs under the tab bar — only the bar paints a background
          // there. Scroll panes end with a spacer the bar's height instead
          // (`.ar-tabbed .ar-scroll::after`, arcade.css), so the last card can
          // still scroll clear of it.
          tabs && "ar-tabbed",
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
 *
 * Root screens end the header with the profile avatar — profile isn't a tab,
 * so this is its one consistent place. A pushed screen (`back`) gets a back
 * button instead and no avatar, since it's already off the root.
 */
export function ScreenHeader({
  eyebrow,
  title,
  trailing,
  back = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
  /** Pushed screen: show a back button, hide the profile avatar. */
  back?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn("relative z-20 flex items-end justify-between gap-3 px-5 pb-4", className)}
      style={{ paddingTop: "calc(var(--ar-top-inset) + 16px)" }}
    >
      {back && <BackButton className="mb-0.5 self-end" />}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="font-hud text-ar-green mb-1 text-[10px] font-semibold tracking-[0.32em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="font-hud text-ar-text truncate text-[26px] leading-none font-bold tracking-tight">
          {title}
        </h1>
      </div>
      {(trailing ?? !back) && (
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
          {!back && <ProfileButton />}
        </div>
      )}
    </header>
  );
}

/**
 * Round glass back button. Opened straight from a shared link there's no
 * in-app history to return to, so it falls back to the map.
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back();
        else void router.push("/map");
      }}
      aria-label="Back"
      className={cn(
        "ar-glass text-ar-text flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        className,
      )}
    >
      <ChevronLeft size={17} strokeWidth={2.4} />
    </button>
  );
}
