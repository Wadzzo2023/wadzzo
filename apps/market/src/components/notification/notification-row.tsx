"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Circle, CircleDot, Trash2 } from "lucide-react";
import Link from "next/link";

import { cn } from "@wadzzo/ui/lib/cn";
import { Avatar } from "@wadzzo/ui/patterns/person";
import type { InboxItem } from "@wadzzo/platform/notifications";

import { describeFan } from "./describe";
import { useInboxActions } from "./use-inbox-actions";

/**
 * One line of the inbox. Opening it marks it read; the dot toggles read/unread
 * and the bin deletes it (both act on every notification folded into the line).
 */
export function NotificationRow({ item }: { item: InboxItem }) {
  const { markRead, markUnread, remove } = useInboxActions();
  const d = describeFan(item);
  const actor = item.actors[0];
  const ago = formatDistanceToNowStrict(new Date(item.createdAt), {
    addSuffix: true,
  });

  const body = (
    <>
      <span className="relative shrink-0">
        <Avatar src={actor?.image} name={actor?.name} className="size-11" />
        <span
          className={cn(
            "ring-background absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-2",
            d.tone,
          )}
        >
          <d.icon className="size-3" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug">{d.text}</span>
        {item.title && (
          <span className="text-muted-foreground mt-0.5 block truncate text-sm">
            “{item.title}”
          </span>
        )}
        <span className="text-muted-foreground mt-1 block text-xs">{ago}</span>
      </span>
    </>
  );
  const cls = "flex min-w-0 flex-1 items-start gap-3 py-3.5 pr-11";

  return (
    <li
      className={cn(
        "group hover:bg-foreground/[0.04] relative flex items-start gap-1 pl-1 transition-colors",
        item.unread && "bg-primary/[0.06]",
      )}
    >
      <button
        type="button"
        onClick={() =>
          item.unread ? markRead.mutate({ ids: item.ids }) : markUnread.mutate({ ids: item.ids })
        }
        className="text-primary mt-[1.4rem] flex size-6 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
        aria-label={item.unread ? "Mark as read" : "Mark as unread"}
        title={item.unread ? "Mark as read" : "Mark as unread"}
      >
        {item.unread ? (
          <CircleDot className="size-4" />
        ) : (
          <Circle className="text-muted-foreground/60 size-3" />
        )}
      </button>
      {d.href ? (
        <Link
          href={d.href}
          onClick={() => item.unread && markRead.mutate({ ids: item.ids })}
          className={cls}
        >
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
      <button
        type="button"
        onClick={() => remove.mutate({ ids: item.ids })}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive absolute top-3 right-2 flex size-8 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60"
        aria-label="Delete notification"
        title="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}
