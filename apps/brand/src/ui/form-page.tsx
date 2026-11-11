"use client";

import { X, type LucideIcon } from "lucide-react";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import { cn } from "@wadzzo/ui/lib/cn";
import { Button } from "@wadzzo/ui/poster/button";
import { PageHeader } from "@wadzzo/ui/poster/page-header";
import { Tabs, TabsList, TabsTrigger } from "@wadzzo/ui/poster/tabs";

import { useFormCard } from "./form-card";

/** The tab showing in a map card (null: the card has no tabs, everything shows). */
const CardTabContext = createContext<string | null>(null);

/** In a map card with tabs, whether something on `tab` is showing. Always true elsewhere. */
function useCardTabShown(tab?: string) {
  const active = useContext(CardTabContext);
  return !tab || active === null || active === tab;
}

/**
 * Something that isn't a FormSection (a banner, the AI box) that belongs to one tab of the map
 * card. Hidden rather than unmounted, so its fields keep their values and their validation.
 */
export function CardTab({ tab, children }: { tab: string; children: ReactNode }) {
  const shown = useCardTabShown(tab);
  return (
    <div data-card-tab={tab} className={shown ? undefined : "hidden"}>
      {children}
    </div>
  );
}

/**
 * Layout for the create/edit pages (pins, hotspots, bounties, posts, assets).
 * Desktop: form on the left, a sticky side column (map, preview, summary) on
 * the right. Phone: one column with the actions pinned above the tab bar.
 */
export function FormPage({
  title,
  description,
  icon: Icon,
  cardTabs,
  cardHeaderAction,
  back,
  aside,
  actions,
  children,
  onSubmit,
}: {
  title: string;
  description?: string;
  /** Shown beside the title in card mode (as the trail builder's header). */
  icon?: LucideIcon;
  /**
   * In a map card, the form is split into these tabs (as the trail builder). Sections pick
   * theirs with `tab`; anything without one shows on every tab. The first tab opens first.
   */
  cardTabs?: { id: string; label: string }[];
  /** In a map card, a small control beside the close button (the template picker). */
  cardHeaderAction?: ReactNode;
  back: { href: string; label: string };
  aside?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
}) {
  const card = useFormCard();
  if (card)
    return (
      <FormCardLayout
        title={title}
        description={description}
        icon={Icon}
        tabs={cardTabs}
        headerAction={cardHeaderAction}
        actions={actions}
        onSubmit={onSubmit}
        onClose={card.onClose}
      >
        {children}
      </FormCardLayout>
    );
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-6xl px-4 pt-5 pb-40 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
      noValidate
    >
      <PageHeader
        title={title}
        description={description}
        back={back}
        actions={<div className="hidden items-center gap-2 lg:flex">{actions}</div>}
      />
      <div className={cn("mt-6 grid gap-6", aside && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="@container min-w-0 space-y-5">{children}</div>
        {aside && <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">{aside}</aside>}
      </div>
      {/* Phone: actions stay reachable above the tab bar. */}
      <div className="bg-card fixed inset-x-0 bottom-[calc(3.375rem+max(0.375rem,var(--safe-bottom)))] z-30 flex items-center justify-end gap-2 border-t-2 px-4 py-3 lg:hidden">
        {actions}
      </div>
    </form>
  );
}

/**
 * A form as a floating panel on the base map, laid out like the trail builder: header, tabs,
 * the tab's fields scrolling, the actions below. The page's side column (map, summary) is left
 * out: the base map is right there. Every tab stays mounted (only hidden), so nothing typed is
 * lost; when Save finds a problem on another tab, that tab opens.
 *
 * The scroll area is `relative` so hidden absolutely-placed inputs (native selects, file
 * inputs) stay inside it instead of stretching the page, and `overscroll-contain` keeps a
 * scroll that reaches the end from moving the page.
 */
function FormCardLayout({
  title,
  description,
  icon: Icon,
  tabs,
  headerAction,
  actions,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  tabs?: { id: string; label: string }[];
  headerAction?: ReactNode;
  actions: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.id ?? null);
  const body = useRef<HTMLDivElement>(null);
  const show = (id: string) => {
    setTab(id);
    body.current?.scrollTo({ top: 0 });
  };

  // After Save: if the problems are all on other tabs, open the first of them.
  const openProblemTab = () => {
    const root = body.current;
    if (!root || !tabs) return;
    const errors = [...root.querySelectorAll<HTMLElement>("p.text-destructive")];
    const tabOf = (el: HTMLElement) =>
      el.closest<HTMLElement>("[data-card-tab]")?.dataset.cardTab ?? null;
    if (!errors.length || errors.some((el) => tabOf(el) === tab || tabOf(el) === null)) return;
    const first = tabOf(errors[0]!);
    if (first) show(first);
  };

  return (
    <form
      onSubmit={(e) => {
        onSubmit?.(e);
        // Validation is async: look once the messages have rendered.
        window.setTimeout(openProblemTab, 120);
      }}
      noValidate
      aria-label={title}
      className="bg-card border-foreground/10 relative flex max-h-full w-full flex-col overflow-hidden rounded-[1.2rem] border-2 shadow-lg lg:w-[380px]"
    >
      <div className="border-foreground/10 border-b-2 p-3">
        {/* Title row: name, then the header control (Template) and close. */}
        <div className="flex items-center gap-2">
          {Icon && <Icon className="text-primary size-4 shrink-0" aria-hidden />}
          <p className="font-hud min-w-0 flex-1 truncate text-sm font-semibold">{title}</p>
          {headerAction && (
            <div className="shrink-0 [&_button]:h-8 [&_button]:px-2.5 [&_button]:text-xs">
              {headerAction}
            </div>
          )}
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </div>
        {description && (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{description}</p>
        )}
      </div>

      {tabs && tab && (
        <Tabs value={tab} onValueChange={show}>
          <TabsList className="mx-3 mt-3 flex w-[calc(100%-1.5rem)]">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-1">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <CardTabContext.Provider value={tabs ? tab : null}>
        <div
          ref={body}
          className="@container relative min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-3"
        >
          {children}
        </div>
      </CardTabContext.Provider>

      <div className="border-foreground/10 flex items-center justify-end gap-1.5 border-t-2 p-3 [&_button]:h-8 [&_button]:px-3 [&_button]:text-xs">
        {actions}
      </div>
    </form>
  );
}

/** One titled block of a form page. */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
  tab,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  /** Which tab of a map card it's on (see FormPage `cardTabs`). Ignored on a page. */
  tab?: string;
}) {
  const card = useFormCard();
  const shown = useCardTabShown(tab);
  if (card)
    // Flat in the card (as the trail builder's sections): a small label, no box of its own.
    return (
      <section data-card-tab={tab} className={cn(className, !shown && "hidden")}>
        <div className="mb-3">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
            {Icon && <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />}
            {title}
          </h2>
          {description && <div className="text-muted-foreground mt-1 text-xs">{description}</div>}
        </div>
        <div className="space-y-3">{children}</div>
      </section>
    );
  return (
    <section
      className={cn("bg-card border-foreground/10 rounded-[1.4rem] border-2 p-5", className)}
    >
      <div className="mb-4">
        <h2 className="display flex items-center gap-2.5 text-2xl">
          {Icon && (
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 -rotate-6 items-center justify-center rounded-lg">
              <Icon className="size-4" strokeWidth={2.4} />
            </span>
          )}
          {title}
        </h2>
        {description && <div className="text-muted-foreground mt-1 text-sm">{description}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Label + control + error, the same everywhere. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  /** Shown at the end of the label row (e.g. the AI button). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
