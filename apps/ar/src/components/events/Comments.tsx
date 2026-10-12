import { formatDistanceToNowStrict } from "date-fns";
import { Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "~/components/ui/Skeleton";
import { useAuth } from "~/lib/ar/store";
import type { ArComment, ArCommentTarget } from "~/lib/ar/types";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

const AVATAR_FALLBACK = "/brand/wadzzo-mark.png";

/**
 * ── Comments ───────────────────────────────────────────────────────────────
 *
 * The public thread under an event or an announcement. Flat — no replies —
 * because these are short reactions ("see you there!"), not the back-and-forth
 * a bounty brief draws. Newest first, composer on top of the list so the box
 * you type in is next to what you're answering.
 */
export function CommentsSection({ target }: { target: ArCommentTarget }) {
  const comments = api.events.comments.useQuery(target);

  return (
    <section>
      <h2 className="font-hud mb-3 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ar-green">
        Comments{comments.data && comments.data.length > 0 ? ` · ${comments.data.length}` : ""}
      </h2>
      <Composer target={target} />
      <div className="mt-4">
        {comments.isPending ? (
          <div className="space-y-3" role="status" aria-label="Loading comments">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : comments.isError ? (
          <p className="rounded-ar border border-ar-danger/40 bg-ar-danger/10 px-3.5 py-2.5 text-[12px] text-ar-danger">
            Couldn&rsquo;t load comments.
          </p>
        ) : comments.data.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-ar-faint">No comments yet. Say something.</p>
        ) : (
          <ol className="space-y-4">
            {comments.data.map((c) => (
              <li key={c.id}>
                <CommentRow comment={c} target={target} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Composer({ target }: { target: ArCommentTarget }) {
  const user = useAuth((s) => s.user);
  const requireAuth = useAuth((s) => s.requireAuth);
  const utils = api.useUtils();
  const [text, setText] = useState("");

  const add = api.events.addComment.useMutation({
    onSuccess: () => {
      setText("");
      return Promise.all([
        utils.events.comments.invalidate(target),
        target.kind === "event"
          ? utils.events.byId.invalidate({ id: target.id })
          : utils.events.announcement.invalidate({ id: target.id }),
      ]);
    },
  });

  const submit = () => {
    const content = text.trim();
    if (!content || add.isPending) return;
    if (!requireAuth("events")) return;
    add.mutate({ target, content });
  };

  if (!user) {
    return (
      <button
        onClick={() => requireAuth("events")}
        className="ar-bevel flex h-11 w-full items-center rounded-[22px] px-4 text-left text-[13px] text-ar-faint"
      >
        Sign in to comment
      </button>
    );
  }

  return (
    <div>
      {add.error && <p className="mb-2 text-[12px] text-ar-danger">{add.error.message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor={`comment-${target.kind}`} className="sr-only">
          Add a comment
        </label>
        <textarea
          id={`comment-${target.kind}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder="Add a comment"
          className="ar-bevel max-h-28 min-h-[44px] flex-1 resize-none rounded-[22px] px-4 py-3 text-[14px] leading-snug text-ar-text outline-hidden placeholder:text-ar-faint"
        />
        <button
          type="submit"
          disabled={!text.trim() || add.isPending}
          aria-label="Post comment"
          className="ar-key ar-key-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          <Send size={17} strokeWidth={2.3} />
        </button>
      </form>
    </div>
  );
}

function CommentRow({ comment, target }: { comment: ArComment; target: ArCommentTarget }) {
  const utils = api.useUtils();
  const [confirming, setConfirming] = useState(false);
  const remove = api.events.deleteComment.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.events.comments.invalidate(target),
        target.kind === "event"
          ? utils.events.byId.invalidate({ id: target.id })
          : utils.events.announcement.invalidate({ id: target.id }),
      ]),
  });

  return (
    <div className="flex gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={comment.author.image ?? AVATAR_FALLBACK}
        alt=""
        className="h-[30px] w-[30px] shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="truncate text-[12.5px] font-semibold text-ar-text">
            {comment.author.name ?? "Anonymous"}
          </span>
          <span className="font-hud shrink-0 text-[10px] text-ar-faint">
            {formatDistanceToNowStrict(new Date(comment.createdAt))}
          </span>
          {comment.mine && (
            <button
              onClick={() =>
                confirming
                  ? remove.mutate({ kind: target.kind, commentId: comment.id })
                  : setConfirming(true)
              }
              onBlur={() => setConfirming(false)}
              disabled={remove.isPending}
              aria-label={confirming ? "Confirm delete" : "Delete comment"}
              className={cn(
                "font-hud ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em]",
                confirming ? "text-ar-danger" : "text-ar-faint hover:text-ar-text",
              )}
            >
              <Trash2 size={11} strokeWidth={2.4} />
              {confirming && "Delete?"}
            </button>
          )}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ar-dim">
          {comment.content}
        </p>
      </div>
    </div>
  );
}
