"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@wadzzo/ui/components/popover";
import { cn } from "@wadzzo/ui/lib/cn";
import { Skeleton } from "@wadzzo/ui/patterns/skeleton";
import { api } from "~/utils/api";

import { NotificationRow } from "./notification-row";
import { useInboxActions } from "./use-inbox-actions";

/** Unread count, refreshed every minute and when the tab regains focus (no live connection). */
export function useUnreadCount() {
  return (
    api.fan.notification.inboxUnread.useQuery(
      { scope: "brand" },
      { refetchInterval: 60_000, refetchOnWindowFocus: true },
    ).data ?? 0
  );
}

/** The bell: unread badge, and a short list with "mark all read" and a link to everything. */
export function NotificationBell({
  className,
  side = "bottom",
  align = "end",
}: {
  className?: string;
  side?: "bottom" | "right";
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const list = api.fan.notification.inbox.useQuery({ scope: "brand", limit: 8 }, { enabled: open });
  const { markAllRead } = useInboxActions();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "text-muted-foreground hover:bg-accent hover:text-foreground relative flex size-9 items-center justify-center rounded-lg transition-colors",
          className,
        )}
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="bg-primary text-primary-foreground absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-hud text-sm font-semibold">Notifications</p>
          <button
            type="button"
            disabled={!unread || markAllRead.isPending}
            onClick={() => markAllRead.mutate({ scope: "brand" })}
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </button>
        </div>
        <div className="max-h-[min(26rem,70dvh)] overflow-y-auto p-1.5">
          {list.isPending ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : !list.data?.items.length ? (
            <p className="text-muted-foreground px-4 py-10 text-center text-sm">
              You&apos;re all caught up.
            </p>
          ) : (
            list.data.items.map((item) => (
              <NotificationRow
                key={item.ids[0]}
                item={item}
                compact
                onNavigate={() => setOpen(false)}
              />
            ))
          )}
        </div>
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="text-primary hover:bg-accent/60 block border-t px-4 py-2.5 text-center text-sm font-medium"
        >
          View all
        </Link>
      </PopoverContent>
    </Popover>
  );
}
