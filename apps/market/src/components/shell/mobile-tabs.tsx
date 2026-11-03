"use client";

import { Bell, LogIn, Menu, Search, User } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ArTabButton } from "@wadzzo/ui/poster/ar-tab-button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@wadzzo/ui/components/sheet";
import { useRequireAuth } from "~/hooks/use-require-auth";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";
import { platformBranding } from "@wadzzo/platform/branding";

import { BrandMark } from "./brand-mark";
import { TABS, isActive, type NavItem } from "./nav";
import { openSearch } from "./search-dialog";
import { SidebarBody } from "./sidebar";

const tab =
  "relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[8.5px] font-bold uppercase transition-colors";

const headerIcon =
  "relative flex size-9 shrink-0 items-center justify-center rounded-full bg-side-ink text-side transition-transform duration-200 active:scale-95";

/**
 * Phones have no sidebar. A green header carries the logo, notifications, your profile and the
 * Menu (the whole sidebar as a drawer); a floating green tab bar below has Home · Collection ·
 * [Go to AR, raised] · Market · Search. The active tab gets a gliding ink capsule.
 */
export function MobileTabs() {
  const pathname = usePathname() ?? "";
  const activeTab = TABS.find((t) => isActive(pathname, t));
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];

  const link = (t: NavItem) => {
    const active = t === activeTab;
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={cn(tab, active ? "text-side" : "text-side-ink/75")}
      >
        {active && (
          <motion.span
            layoutId="tab-active"
            layoutDependency={t.href}
            transition={{ type: "spring", stiffness: 460, damping: 36 }}
            className="bg-side-ink absolute inset-0 rounded-2xl"
          />
        )}
        <t.icon className="relative size-5" strokeWidth={2.4} />
        <span className="relative w-full truncate text-center">{t.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-3 bottom-[max(0.75rem,var(--safe-bottom))] z-40 md:hidden"
    >
      <div className="side-scope blob bg-side text-side-ink mx-auto flex max-w-md items-center gap-1 p-1.5 shadow-[0_14px_30px_-12px_hsl(0_0%_0%/0.6)]">
        {left.map(link)}
        <ArTabButton href={platformBranding.urls.arWeb} className="text-side-ink" />
        {right.map(link)}
        <button type="button" onClick={openSearch} className={cn(tab, "text-side-ink/75")}>
          <Search className="size-5" strokeWidth={2.4} />
          Search
        </button>
      </div>
    </nav>
  );
}

/** The phone header: logo and wordmark, then notifications, profile and the Menu drawer. */
export function MobileHeader() {
  const [drawer, setDrawer] = useState(false);
  const { signedIn, loading, session, openSignIn } = useRequireAuth();
  const unseen = api.notification.unseenCount.useQuery(undefined, {
    enabled: signedIn,
    refetchInterval: 60_000,
  });
  const me = api.user.me.useQuery(undefined, { enabled: signedIn, staleTime: 5 * 60_000 });
  const count = signedIn ? (unseen.data ?? 0) : 0;
  const image = me.data?.image ?? session?.user.image ?? null;

  return (
    <>
      <header className="side-scope bg-side text-side-ink sticky top-0 z-30 flex h-16 items-center gap-2 pr-3 pl-4 md:hidden">
        <BrandMark className="min-w-0 flex-1 [&_.display]:text-[1.8rem]" />
        {signedIn && (
          <Link
            href="/notifications"
            aria-label={count ? `Notifications (${count} new)` : "Notifications"}
            className={headerIcon}
          >
            <Bell className="size-[18px]" strokeWidth={2.6} />
            {count > 0 && (
              <span className="bg-pink text-side-ink ring-side absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Link>
        )}
        {!loading &&
          (signedIn ? (
            <button
              type="button"
              onClick={openSignIn}
              aria-label="Account & wallets"
              className="shrink-0 rounded-full transition-transform active:scale-95"
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  className="border-side-ink size-9 rounded-full border-2 object-cover"
                />
              ) : (
                <span className={headerIcon}>
                  <User className="size-[18px]" strokeWidth={2.6} />
                </span>
              )}
            </button>
          ) : (
            <button type="button" onClick={openSignIn} aria-label="Sign in" className={headerIcon}>
              <LogIn className="size-[18px]" strokeWidth={2.6} />
            </button>
          ))}
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Menu"
          className={headerIcon}
        >
          <Menu className="size-5" strokeWidth={2.6} />
        </button>
      </header>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent
          side="right"
          className="side-scope bg-side text-side-ink [&>button:last-child]:text-side-ink flex w-[20rem] max-w-[88vw] flex-col gap-0 border-0 p-0 pt-[env(safe-area-inset-top)] sm:max-w-[20rem]"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Browse {platformBranding.name}</SheetDescription>
          <SidebarBody onNavigate={() => setDrawer(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
