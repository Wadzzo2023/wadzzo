"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Circle, CircleDot, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@wadzzo/ui/components/avatar";
import { cn } from "@wadzzo/ui/lib/cn";
import type { InboxItem } from "@wadzzo/platform/notifications";

import { describeBrand, TONE } from "./describe";
import { useInboxActions } from "./use-inbox-actions";

/**
 * One line of the inbox. Opening it marks it read; the dot toggles read/unread
 * and the bin deletes it (both act on every notification folded into the line).
 */
export function NotificationRow({
  item,
  compact = false,
  onNavigate,
}: {
  item: InboxItem;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { markRead, markUnread, remove } = useInboxActions();
  const d = describeBrand(item);
  const Icon = d.icon;
  const actor = item.actors[0];
  const ago = formatDistanceToNowStrict(new Date(item.createdAt), {
    addSuffix: true,
  });

  const open = () => {
    if (item.unread) markRead.mutate({ ids: item.ids });
    onNavigate?.();
    if (d.href) router.push(d.href);
  };

  const body = (
    <>
      <span className="relative shrink-0">
        <Avatar className={cn(compact ? "size-9" : "size-10")}>
          {actor?.image && <AvatarImage src={actor.image} alt="" />}
          <AvatarFallback className={TONE[d.tone]}>
            <Icon className="size-4" />
          </AvatarFallback>
        </Avatar>
        {actor?.image && (
          <span
            className={cn(
              "ring-card absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full ring-2",
              TONE[d.tone],
            )}
          >
            <Icon className="size-2.5" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "text-muted-foreground block text-sm leading-snug",
            compact ? "line-clamp-2" : "line-clamp-3",
          )}
        >
          {d.text}
        </span>
        <span className="text-faint mt-0.5 block text-xs">{ago}</span>
      </span>
    </>
  );

  return (
    <div
      className={cn(
        "group hover:bg-accent/60 relative flex items-start gap-1 rounded-lg transition-colors",
        item.unread && "bg-primary/[0.04]",
      )}
    >
      <button
        type="button"
        onClick={() =>
          item.unread ? markRead.mutate({ ids: item.ids }) : markUnread.mutate({ ids: item.ids })
        }
        className="text-primary mt-3.5 flex size-6 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
        aria-label={item.unread ? "Mark as read" : "Mark as unread"}
        title={item.unread ? "Mark as read" : "Mark as unread"}
      >
        {item.unread ? (
          <CircleDot className="size-3.5" />
        ) : (
          <Circle className="text-faint size-3" />
        )}
      </button>
      {d.href ? (
        <Link
          href={d.href}
          onClick={() => {
            if (item.unread) markRead.mutate({ ids: item.ids });
            onNavigate?.();
          }}
          className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-9"
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={open}
          className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-9 text-left"
        >
          {body}
        </button>
      )}
      <button
        type="button"
        onClick={() => remove.mutate({ ids: item.ids })}
        className="text-faint hover:bg-destructive/10 hover:text-destructive absolute top-2.5 right-1.5 flex size-7 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60"
        aria-label="Delete notification"
        title="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
