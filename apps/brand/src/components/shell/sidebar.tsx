"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { UserMenu } from "./user-menu";
import { WalletBalance } from "./wallet-balance";
import { platformBranding } from "@wadzzo/platform/branding";

/**
 * Desktop navigation (lg and up). Full width shows group labels and names;
 * collapsed it's an icon rail with tooltips. The choice is remembered.
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

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "bg-card sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-64",
        )}
        aria-label="Portal navigation"
      >
        {/* Brand and Toggle */}
        <div
          className={cn(
            "flex items-center border-b",
            collapsed ? "h-16 justify-center px-0" : "h-16 justify-between px-4",
          )}
        >
          <Link
            href={homeHref}
            className="flex items-center gap-2.5"
            aria-label={`${platformBranding.name} portal home`}
          >
            <span className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <Image
                src={platformBranding.assets.loading}
                alt=""
                width={22}
                height={22}
                className="object-contain"
              />
            </span>
            {!collapsed && (
              <span className="leading-tight">
                <span className="font-hud block text-base font-bold tracking-tight">
                  {platformBranding.name}
                </span>
                <span className="font-hud text-muted-foreground block text-[10px] font-semibold tracking-[0.18em] uppercase">
                  {isPureAdmin ? "Admin portal" : "Brand portal"}
                </span>
              </span>
            )}
          </Link>
          {!collapsed && isApprovedCreator && <NotificationBell side="right" align="start" />}
        </div>
        {collapsed && isApprovedCreator && (
          <div className="flex justify-center pt-2">
            <NotificationBell side="right" align="start" />
          </div>
        )}

        {/* Create + balance */}
        <div className={cn("space-y-2 p-3", collapsed && "px-2")}>
          {!isPureAdmin && <CreateMenu navPermission={navPermission} collapsed={collapsed} />}
          <WalletBalance collapsed={collapsed} />
        </div>

        {/* Groups */}
        <nav
          className="flex-1 scrollbar-thin space-y-5 overflow-y-auto px-3 pb-4"
          aria-label="Sections"
        >
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="font-hud text-faint mb-1.5 px-2 text-[10px] font-semibold tracking-[0.18em] uppercase">
                  {group.label}
                </p>
              )}
              {collapsed && <div className="bg-border mx-auto mb-2 h-px w-6" aria-hidden />}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} active={isActive(pathname, item)} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="space-y-1 border-t p-3">
          <UserMenu collapsed={collapsed} />
        </div>

        {/* chevron on the sidebar's edge, level with the logo: collapses and expands */}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="bg-card text-muted-foreground hover:bg-accent hover:text-foreground absolute top-5 -right-3 z-50 flex size-6 items-center justify-center rounded-full border shadow-sm transition-colors"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
