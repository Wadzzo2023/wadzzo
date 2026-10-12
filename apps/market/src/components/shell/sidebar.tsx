"use client";

import { ChevronLeft, ChevronRight, Menu, Monitor, Moon, Store, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@wadzzo/ui/components/sheet";
import { env } from "~/env";
import { useRequireAuth } from "~/hooks/use-require-auth";
import { useSidebarCollapsed } from "~/hooks/use-sidebar-collapsed";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

import { BrandMark } from "./brand-mark";
import { CurrencyToggle } from "./currency-toggle";
import { ACCOUNT, INFO_LINKS, MAIN, isActive, type NavItem } from "./nav";

const THEMES = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "system", label: "System", icon: Monitor },
] as const;

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
      />
    </svg>
  );
}

const SOCIALS = [
  { href: "https://x.com/WadzzoApp", label: "X", icon: XIcon },
  {
    href: "https://www.instagram.com/wadzzo",
    label: "Instagram",
    icon: InstagramIcon,
  },
  {
    href: "https://facebook.com/wadzzo",
    label: "Facebook",
    icon: FacebookIcon,
  },
];

/** The brand entry: manage your brand, or create one. */
function useBrandEntry() {
  const { signedIn } = useRequireAuth();
  const me = api.user.me.useQuery(undefined, {
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });
  const isBrand = Boolean(me.data?.creator && !me.data.creator.notCreatorButSeller);
  const base = env.NEXT_PUBLIC_BRAND_PORTAL_URL.replace(/\/$/, "");
  return isBrand
    ? {
        label: "My brand",
        hint: "Open brand studio",
        href: base,
        logo: me.data?.creator?.profileUrl ?? null,
        name: me.data?.creator?.name ?? null,
      }
    : {
        label: "Create brand",
        hint: "Start selling",
        href: `${base}/onboarding`,
        logo: null,
        name: null,
      };
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg text-sm font-medium transition-colors",
        collapsed ? "justify-center" : "px-3",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 2} />
      <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
    </Link>
  );
}

function BrandCard({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const brand = useBrandEntry();
  const initial = brand.name?.trim()[0]?.toUpperCase();

  const tile = brand.logo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
  ) : initial ? (
    <span className="bg-primary/12 font-hud text-primary flex size-9 shrink-0 items-center justify-center rounded-lg text-base font-bold">
      {initial}
    </span>
  ) : (
    <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
      <Store className="size-[18px]" />
    </span>
  );

  return (
    <a
      href={brand.href}
      target="_blank"
      rel="noreferrer"
      onClick={onNavigate}
      title={collapsed ? brand.label : undefined}
      aria-label={collapsed ? brand.label : undefined}
      className={cn(
        "group border-foreground/[0.08] bg-surface-2 hover:border-primary/50 flex items-center gap-3 rounded-xl border transition-colors",
        collapsed ? "justify-center p-1.5" : "p-2",
      )}
    >
      {tile}
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold">
              {brand.name ?? brand.label}
            </span>
            <span className="text-muted-foreground block truncate text-xs">{brand.hint}</span>
          </span>
          <ChevronRight className="text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </a>
  );
}

function ThemeSwitch({ collapsed }: { collapsed: boolean }) {
  const { theme: stored, setTheme } = useTheme();
  // next-themes only knows the theme on the client; until then render the default so markup matches the server
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const theme = mounted ? stored : "system";
  if (collapsed) {
    const i = Math.max(
      0,
      THEMES.findIndex((t) => t.id === theme),
    );
    const current = THEMES[i]!;
    const next = THEMES[(i + 1) % THEMES.length]!;
    return (
      <button
        type="button"
        onClick={() => setTheme(next.id)}
        title={`Theme: ${current.label}`}
        aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-full items-center justify-center rounded-lg transition-colors"
      >
        <current.icon className="size-4" />
      </button>
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="bg-foreground/[0.04] grid grid-cols-3 gap-1 rounded-lg p-1"
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => setTheme(t.id)}
          className={cn(
            "flex h-7 items-center justify-center rounded-md transition-colors",
            theme === t.id
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <t.icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

/** Everything inside the sidebar; the desktop rail and the mobile drawer both render this. */
function SidebarBody({
  collapsed,
  onNavigate,
  showCurrency = false,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  showCurrency?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const { signedIn } = useRequireAuth();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain">
      <div
        className={cn(
          "border-foreground/[0.06] mb-3 flex h-16 shrink-0 items-center border-b",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        <BrandMark compact={collapsed} />
      </div>

      <nav
        aria-label="Sections"
        className={cn("flex-1 space-y-1 pb-3", collapsed ? "px-2" : "px-3")}
      >
        {MAIN.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item)}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
        {signedIn && (
          <>
            <div className="border-foreground/[0.06] my-2 border-t" role="separator" />
            {ACCOUNT.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}
      </nav>

      <div
        className={cn(
          "shrink-0 space-y-3 pb-[max(0.75rem,var(--safe-bottom))]",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <BrandCard collapsed={collapsed} onNavigate={onNavigate} />
        {showCurrency && (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-muted-foreground text-xs font-medium">Show prices in</span>
            <CurrencyToggle />
          </div>
        )}
        <ThemeSwitch collapsed={collapsed} />
        {!collapsed && (
          <>
            <div className="border-foreground/[0.06] text-muted-foreground flex flex-col items-center gap-2 border-t pt-3 text-center text-[11px]">
              <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
                {INFO_LINKS.map((l, i) => (
                  <span key={l.href} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span
                        aria-hidden
                        className="bg-muted-foreground/50 size-[3px] rounded-full"
                      />
                    )}
                    <Link
                      href={l.href}
                      onClick={onNavigate}
                      className="hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </Link>
                  </span>
                ))}
              </div>
              <span className="flex items-center justify-center gap-3">
                {SOCIALS.map((s) => (
                  <a
                    key={s.href}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={s.label}
                    title={s.label}
                    className="hover:text-foreground transition-colors"
                  >
                    <s.icon className="size-3.5" />
                  </a>
                ))}
              </span>
              <span>© {new Date().getFullYear()} Wadzzo</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The fixed sidebar on large screens: full width, or collapsed to icons. */
export function DesktopSidebar() {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  return (
    <aside
      className={cn(
        "border-foreground/[0.06] bg-background sticky top-0 z-50 hidden h-dvh shrink-0 border-r transition-[width] duration-200 xl:block",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <SidebarBody collapsed={collapsed} />
      {/* chevron on the sidebar's edge, level with the logo: collapses and expands */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="border-foreground/10 bg-background text-muted-foreground hover:bg-accent hover:text-foreground absolute top-5 -right-3 flex size-6 items-center justify-center rounded-full border shadow-sm transition-colors"
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
      </button>
    </aside>
  );
}

/** The menu button (small screens) and the drawer it opens from the left. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-10 shrink-0 items-center justify-center rounded-full xl:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 max-w-[85vw] flex-col gap-0 p-0 sm:max-w-72">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <SheetDescription className="sr-only">Browse Wadzzo</SheetDescription>
        <SidebarBody collapsed={false} showCurrency onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
