"use client";

import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Reply, SendHorizontal, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";

import { useRequireAuth } from "~/hooks/use-require-auth";
import { EmptyState } from "~/ui/empty-state";
import { Avatar } from "@wadzzo/ui/patterns/person";
import { Skeleton } from "@wadzzo/ui/patterns/skeleton";
import { api } from "~/utils/api";

/**
 * The full comment thread under a post, styled like the inline comments in
 * the feed: chat bubbles, one level of replies, a pill-shaped box to write.
 * Anyone can read; commenting needs sign-in.
 */
export function Comments({ postId }: { postId: number }) {
  const { session } = useRequireAuth();
  const comments = api.post.comments.useQuery({ postId });
  const remove = api.post.deleteComment.useMutation({
    onSuccess: () => void comments.refetch(),
  });
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const total = comments.data?.reduce((n, c) => n + 1 + c.childComments.length, 0) ?? 0;

  return (
    <section id="comments" className="glass scroll-mt-24 space-y-5 rounded-[1.4rem] p-4 sm:p-5">
      <h2 className="display flex items-center gap-2 text-3xl">
        <MessageCircle className="text-primary size-5" /> Comments
        {comments.data && (
          <span className="bg-foreground/10 text-muted-foreground rounded-full px-2 text-xs tabular-nums">
            {total}
          </span>
        )}
      </h2>

      <CommentForm postId={postId} onDone={() => void comments.refetch()} />

      {comments.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
      ) : !comments.data?.length ? (
        <EmptyState
          icon={MessageCircle}
          title="No comments yet"
          description="Be the first to say something."
          className="border-0 py-6"
        />
      ) : (
        <ul className="space-y-4">
          {comments.data.map((c) => (
            <li key={c.id} className="space-y-3">
              <CommentRow
                c={c}
                mine={c.userId === session?.user.id}
                onDelete={() => remove.mutate({ id: c.id })}
                onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
              />
              {(c.childComments.length > 0 || replyTo === c.id) && (
                <div className="border-foreground/[0.06] ml-10 space-y-3 border-l-2 pl-3">
                  {c.childComments.map((r) => (
                    <CommentRow
                      key={r.id}
                      c={r}
                      mine={r.userId === session?.user.id}
                      onDelete={() => remove.mutate({ id: r.id })}
                    />
                  ))}
                  {replyTo === c.id && (
                    <CommentForm
                      postId={postId}
                      parentId={c.id}
                      replyingTo={c.user.name ?? "Fan"}
                      autoFocus
                      onDone={() => (setReplyTo(null), void comments.refetch())}
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Row = {
  id: number;
  content: string;
  createdAt: Date;
  user: { name: string | null; image: string | null };
};

function CommentRow({
  c,
  mine,
  onDelete,
  onReply,
}: {
  c: Row;
  mine: boolean;
  onDelete: () => void;
  onReply?: () => void;
}) {
  return (
    <div className="flex gap-2.5">
      <Avatar src={c.user.image} name={c.user.name} className="size-8 text-xs" />
      <div className="min-w-0 flex-1">
        <div className="bg-foreground/[0.04] w-fit max-w-full rounded-2xl rounded-tl-sm px-3.5 py-2">
          <p className="text-xs font-semibold">{c.user.name ?? "Fan"}</p>
          <p className="text-foreground/90 text-sm break-words whitespace-pre-line">{c.content}</p>
        </div>
        <div className="text-muted-foreground mt-1 flex items-center gap-3 pl-2 text-xs">
          <span>{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="hover:text-foreground inline-flex items-center gap-1 font-semibold"
            >
              <Reply className="size-3.5" /> Reply
            </button>
          )}
          {mine && (
            <button
              type="button"
              onClick={onDelete}
              className="hover:text-destructive inline-flex items-center gap-1 font-semibold"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentForm({
  postId,
  parentId,
  replyingTo,
  autoFocus,
  onDone,
}: {
  postId: number;
  parentId?: number;
  replyingTo?: string;
  autoFocus?: boolean;
  onDone: () => void;
}) {
  const { signedIn, session, openSignIn } = useRequireAuth();
  const [text, setText] = useState("");
  const add = api.post.comment.useMutation({
    onSuccess: () => (setText(""), onDone()),
    onError: (e) => toast.error(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!signedIn) return openSignIn();
    if (text.trim()) add.mutate({ postId, content: text.trim(), parentId });
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2.5">
      <Avatar
        src={session?.user.image ?? null}
        name={session?.user.name ?? null}
        className={parentId ? "size-7 text-[10px]" : "size-8 text-xs"}
      />
      <div className="bg-foreground/[0.04] ring-foreground/[0.08] focus-within:ring-primary/50 flex h-11 flex-1 items-center rounded-full pr-1 pl-4 ring-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => !signedIn && openSignIn()}
          autoFocus={autoFocus}
          maxLength={2000}
          placeholder={
            !signedIn
              ? "Sign in to comment"
              : replyingTo
                ? `Reply to ${replyingTo}…`
                : "Write a comment…"
          }
          aria-label={parentId ? "Write a reply" : "Write a comment"}
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="submit"
          disabled={add.isPending || (signedIn && !text.trim())}
          aria-label="Send"
          className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
        >
          <SendHorizontal className="size-4" />
        </button>
      </div>
    </form>
  );
}
