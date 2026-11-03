"use client";

import { Menu, Plus } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NotificationBell } from "~/components/notification/notification-bell";
import { ArTabButton } from "@wadzzo/ui/poster/ar-tab-button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@wadzzo/ui/components/drawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@wadzzo/ui/components/sheet";
import { cn } from "@wadzzo/ui/lib/cn";
import { platformBranding } from "@wadzzo/platform/branding";

import { getVisibleNavGroups } from "./access-rules";
import { ArLaunchButton, MarketLaunchButton } from "./launch-tiles";
import {
  ADMIN_NAV,
  BRAND_NAV,
  CREATE_ACTIONS,
  isActive,
  MOBILE_TABS,
  type BrandEntry,
  type NavItem,
} from "./nav";
import { BigNavLink, PortalMark } from "./sidebar";
import { SidebarFooter } from "./sidebar-footer";
import { UserMenu } from "./user-menu";
import { WalletBalance } from "./wallet-balance";

type Access = {
  isAdmin: boolean;
  navPermission: boolean;
  isApprovedCreator?: boolean;
  isSuperAdmin?: boolean;
  brandEntry?: BrandEntry | null;
};

const headerIcon =
  "relative flex size-9 shrink-0 items-center justify-center rounded-full bg-side-ink text-side transition-transform duration-200 active:scale-95";

/**
 * Phone header, as in the marketplace: logo and wordmark, then Create, notifications, your
 * profile and the Menu (every section, the launch tiles, the balance and the footer, in a drawer).
 */
export function MobileTopBar({
  homeHref = "/pins",
  showBell = false,
  ...access
}: Access & { homeHref?: string; showBell?: boolean }) {
  const pathname = usePathname() ?? "";
  const [sheet, setSheet] = useState<"create" | "menu" | null>(null);
  const { isAdmin, navPermission, isApprovedCreator = false } = access;
  const isPureAdmin = isAdmin && !isApprovedCreator;
  const groups = getVisibleNavGroups({
    isAdmin,
    isApprovedCreator,
    navPermission,
    isSuperAdmin: access.isSuperAdmin ?? false,
    brandEntry: access.brandEntry ?? null,
  });
  const close = () => setSheet(null);

  return (
    <>
      <header className="side-scope bg-side text-side-ink sticky top-0 z-30 flex h-16 items-center gap-2 pr-3 pl-4 lg:hidden">
        <PortalMark
          href={homeHref}
          tagline={isPureAdmin ? "admin portal" : "brand portal"}
          className="flex-1 [&_.display]:text-[1.8rem]"
        />
        {!isPureAdmin && (
          <button
            type="button"
            onClick={() => setSheet("create")}
            aria-label="Create"
            className={headerIcon}
          >
            <Plus className="size-5" strokeWidth={2.8} />
          </button>
        )}
        {showBell && <NotificationBell />}
        <UserMenu compact />
        <button
          type="button"
          onClick={() => setSheet("menu")}
          aria-label="Menu"
          className={headerIcon}
        >
          <Menu className="size-5" strokeWidth={2.6} />
        </button>
      </header>

      {/* Create */}
      <Drawer open={sheet === "create"} onOpenChange={(o) => setSheet(o ? "create" : null)}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-hud">Create</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto px-4 pb-4">
            {CREATE_ACTIONS.filter((a) => !a.gated || navPermission).map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  onClick={close}
                  className="bg-surface-2 flex flex-col gap-2 rounded-xl border p-3 active:scale-[0.98]"
                >
                  <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-hud text-sm font-semibold">{a.label}</span>
                  <span className="text-muted-foreground text-xs leading-snug">
                    {a.description}
                  </span>
                </Link>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Menu: the desktop sidebar's body as a drawer */}
      <Sheet open={sheet === "menu"} onOpenChange={(o) => setSheet(o ? "menu" : null)}>
        <SheetContent
          side="right"
          className="side-scope bg-side text-side-ink [&>button:last-child]:text-side-ink flex w-[20rem] max-w-[88vw] flex-col gap-0 border-0 p-0 pt-[env(safe-area-inset-top)] sm:max-w-[20rem]"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">
            Every section of the {platformBranding.name} portal
          </SheetDescription>
          <div className="flex shrink-0 items-center px-5 pt-6 pr-14 pb-4">
            <PortalMark href={homeHref} tagline={isPureAdmin ? "admin portal" : "brand portal"} />
          </div>
          <div className="no-scrollbar border-side-ink/20 relative min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain border-y-2 border-dashed px-5 py-5">
            <nav className="space-y-4" aria-label="Sections">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="marker mb-1 -rotate-2 text-xs">*{group.label.toLowerCase()}*</p>
                  <ul>
                    {group.items.map((item, i) => (
                      <li key={item.href}>
                        {i > 0 && <div className="dash-rule my-1" role="separator" />}
                        <BigNavLink
                          item={item}
                          active={isActive(pathname, item)}
                          onNavigate={close}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="space-y-2.5">
              <ArLaunchButton onNavigate={close} />
              <MarketLaunchButton onNavigate={close} />
            </div>
            <WalletBalance />
          </div>
          <div className="shrink-0 px-5 pt-3 pb-[max(1rem,var(--safe-bottom))]">
            <SidebarFooter />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

const tab =
  "relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[8.5px] font-bold uppercase transition-colors";

/**
 * Phone tab bar, the same floating green bar as the marketplace's: Map · Stores · [AR, raised] ·
 * Bounties · Pins (decided; Create and Menu are in the header). Pure admins (admin, not an approved
 * creator) get Creators · Users · [AR] · Review · Maps. Tabs the brand can't open yet (no nav
 * permission) are swapped for ones it can.
 */
export function MobileTabBar({ isAdmin, navPermission, isApprovedCreator = false }: Access) {
  const pathname = usePathname() ?? "";

  let left: NavItem[];
  let right: NavItem[];
  if (isAdmin && !isApprovedCreator) {
    const pick = (href: string) => ADMIN_NAV.items.find((i) => i.href === href)!;
    left = [pick("/admin/creators"), pick("/admin/users")];
    right = [pick("/admin/pins"), pick("/admin/maps")];
  } else {
    const allowed = (i: NavItem) => !i.gated || navPermission;
    const taken = new Set([...MOBILE_TABS.left, ...MOBILE_TABS.right].map((t) => t.href));
    const fallback = BRAND_NAV.flatMap((g) => g.items).filter(
      (i) => !i.gated && !taken.has(i.href),
    );
    const fill = (tabs: NavItem[]) =>
      tabs.map((t) => (allowed(t) ? t : fallback.shift())).filter((t): t is NavItem => !!t);
    left = fill(MOBILE_TABS.left);
    right = fill(MOBILE_TABS.right);
  }
  const activeTab = [...left, ...right].find((t) => isActive(pathname, t));

  const link = (t: NavItem) => {
    const active = t === activeTab;
    const Icon = t.icon;
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
            transition={{ type: "spring", stiffness: 460, damping: 36 }}
            className="bg-side-ink absolute inset-0 rounded-2xl"
          />
        )}
        <Icon className="relative size-5" strokeWidth={2.4} />
        <span className="relative w-full truncate text-center">{t.shortLabel ?? t.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-3 bottom-[max(0.75rem,var(--safe-bottom))] z-40 lg:hidden"
    >
      <div className="side-scope blob bg-side text-side-ink mx-auto flex max-w-md items-center gap-1 p-1.5 shadow-[0_14px_30px_-12px_hsl(0_0%_0%/0.6)]">
        {left.map(link)}
        <ArTabButton href={platformBranding.urls.arWeb} className="text-side-ink" />
        {right.map(link)}
      </div>
    </nav>
  );
}
