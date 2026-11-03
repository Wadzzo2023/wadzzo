"use client";

import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wadzzo/ui/components/tooltip";
import { cn } from "@wadzzo/ui/lib/cn";

import { getPortalLandingRoute, getVisibleNavGroups } from "./access-rules";
import { NotificationBell } from "~/components/notification/notification-bell";

import { CreateMenu } from "./create-menu";
import { isActive, type NavItem, type BrandEntry } from "./nav";
import { ArLaunchButton, MarketLaunchButton } from "./launch-tiles";
import { SidebarFooter } from "./sidebar-footer";
import { UserMenu } from "./user-menu";
import { WalletBalance } from "./wallet-balance";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * The portal's logo on an ink blob and the stacked condensed wordmark, as in the marketplace
 * sidebar (`BrandMark` there). `compact` is the badge alone.
 */
export function PortalMark({
  href,
  tagline,
  compact = false,
  plain = false,
  className,
}: {
  href: string;
  tagline: string;
  compact?: boolean;
  /** The wordmark in the page's own colours (the phone header, which has no green block). */
  plain?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("group flex min-w-0 items-center gap-3", className)}
      aria-label={`${platformBranding.name} portal home`}
    >
      <span className="blob bg-side-ink flex size-11 shrink-0 items-center justify-center transition-transform duration-200 group-hover:-rotate-6">
        <Image
          src={platformBranding.assets.loading}
          alt=""
          width={26}
          height={22}
          style={{ width: 26, height: "auto" }}
          className="object-contain"
          priority
        />
      </span>
      {!compact && (
        <span className={cn("min-w-0 leading-none", plain ? "text-foreground" : "text-side-ink")}>
          <span className="display block truncate text-[length:var(--side-title-size,2.1rem)]">
            {platformBranding.name}
          </span>
          <span
            className={cn(
              "marker block -rotate-2 text-[10px] whitespace-nowrap",
              plain ? "text-primary" : "text-side-ink/75",
            )}
          >
            {tagline}
          </span>
        </span>
      )}
    </Link>
  );
}

/**
 * Desktop navigation (lg and up), the same green block as the marketplace sidebar: logo, create
 * and notifications on top, a scrolling body (the sections as big condensed words with ink
 * arrows, "Go to AR" and "Go to Marketplace", the balance card) and a fixed footer (profile, theme
 * and socials, app downloads, info links). Collapsed it's a rail of ink circles with tooltips.
 * The choice is remembered.
 */
export function Sidebar({
  collapsed,
  onToggle,
  isAdmin,
  navPermission,
  isApprovedCreator = false,
  isSuperAdmin = false,
  brandEntry = null,
}: {
  collapsed: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  navPermission: boolean;
  isApprovedCreator?: boolean;
  isSuperAdmin?: boolean;
  brandEntry?: BrandEntry | null;
}) {
  const pathname = usePathname() ?? "";
  const groups = getVisibleNavGroups({
    isAdmin,
    isApprovedCreator,
    navPermission,
    isSuperAdmin,
    brandEntry,
  });
  const homeHref = getPortalLandingRoute({ isAdmin, isApprovedCreator });
  const isPureAdmin = isAdmin && !isApprovedCreator;
  const tagline = isPureAdmin ? "admin portal" : "brand portal";

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "side-scope bg-side text-side-ink sticky top-0 z-40 hidden h-dvh shrink-0 flex-col lg:flex",
          collapsed ? "w-[5.25rem]" : "w-[19.5rem]",
        )}
        aria-label="Portal navigation"
      >
        {/* fixed header: logo, create and notifications */}
        {collapsed ? (
          <div className="flex shrink-0 flex-col items-center gap-3 px-2 pt-5 pb-3">
            <PortalMark href={homeHref} tagline={tagline} compact />
            {!isPureAdmin && <CreateMenu navPermission={navPermission} collapsed />}
            {isApprovedCreator && (
              <NotificationBell className="size-10" side="right" align="start" />
            )}
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-6 pb-4">
            <PortalMark href={homeHref} tagline={tagline} />
            <div className="flex shrink-0 items-center gap-2">
              {!isPureAdmin && <CreateMenu navPermission={navPermission} />}
              {isApprovedCreator && (
                <NotificationBell className="size-10" side="right" align="start" />
              )}
            </div>
          </div>
        )}

        {/* scrolling body: the sections, the launch tiles, then the balance */}

        {/* `relative` keeps absolute children (sr-only labels) inside the scroll area; without it they stretch the page and the sidebar scrolls away with it */}
        <div
          className={cn(
            "no-scrollbar border-side-ink/20 relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-y-2 border-dashed",
            collapsed
              ? "flex flex-col items-center gap-3 px-2 py-3 [&>*]:shrink-0"
              : "space-y-5 px-5 py-5",
          )}
        >
          {collapsed ? (
            <nav className="flex flex-col items-center gap-3" aria-label="Sections">
              {groups.map((group, g) => (
                <div key={group.label} className="flex flex-col items-center gap-3">
                  {g > 0 && <div className="dash-rule w-8" aria-hidden />}
                  {group.items.map((item) => (
                    <RailLink key={item.href} item={item} active={isActive(pathname, item)} />
                  ))}
                </div>
              ))}
            </nav>
          ) : (
            <nav className="space-y-4" aria-label="Sections">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="marker mb-1 -rotate-2 text-xs">*{group.label.toLowerCase()}*</p>
                  <ul>
                    {group.items.map((item, i) => (
                      <li key={item.href}>
                        {i > 0 && <div className="dash-rule my-1" role="separator" />}
                        <BigNavLink item={item} active={isActive(pathname, item)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}

          {!collapsed && (
            <div className="space-y-2.5">
              <ArLaunchButton />
              <MarketLaunchButton />
            </div>
          )}

          <WalletBalance collapsed={collapsed} className={collapsed ? "w-11" : undefined} />
        </div>

        {/* fixed footer */}
        {collapsed ? (
          <div className="flex shrink-0 justify-center px-2 pt-3 pb-4">
            <UserMenu collapsed />
          </div>
        ) : (
          <div className="shrink-0 px-5 pt-3 pb-[max(1rem,var(--safe-bottom))]">
            <SidebarFooter />
          </div>
        )}

        {/* chevron on the middle of the sidebar's edge: collapses and expands */}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="border-side bg-side-ink text-side absolute top-1/2 -right-3.5 z-50 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
        >
          {collapsed ? (
            <ChevronRight className="size-4" strokeWidth={2.6} />
          ) : (
            <ChevronLeft className="size-4" strokeWidth={2.6} />
          )}
        </button>
      </aside>
    </TooltipProvider>
  );
}

/**
 * A menu row as in the marketplace sidebar: a condensed word and an arrow in an ink circle; the
 * current page gets a scribbled underline and a mint arrow. A notch smaller than the market's,
 * since the portal lists a dozen sections rather than four.
 */
export function BigNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className="group flex items-center justify-between gap-3 py-1"
    >
      <span className="relative min-w-0">
        <span className="display block truncate text-[length:var(--side-nav-size,1.7rem)] transition-transform duration-200 group-hover:translate-x-1">
          {item.label}
        </span>
        {active && (
          <svg
            aria-hidden
            viewBox="0 0 120 10"
            preserveAspectRatio="none"
            className="text-side-ink absolute -bottom-1.5 left-0 h-2.5 w-full"
          >
            <path
              d="M2 6 C 30 1, 60 9, 118 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:-rotate-45",
          active ? "bg-side-mint text-side-ink" : "bg-side-ink text-side",
        )}
      >
        <ArrowRight className="size-[18px]" strokeWidth={2.6} />
      </span>
    </Link>
  );
}

/** The collapsed sidebar's link: an ink circle (mint when current), named in a tooltip. */
function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex size-11 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110",
            active ? "bg-side-mint text-side-ink" : "bg-side-ink text-side",
          )}
        >
          <Icon className="size-5" strokeWidth={2.4} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
