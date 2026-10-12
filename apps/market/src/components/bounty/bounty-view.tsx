"use client";

import { formatDistanceToNow } from "date-fns";
import {
  BadgeCheck,
  ExternalLink,
  FileText,
  Lock,
  MessageCircle,
  MessagesSquare,
  Paperclip,
  Pencil,
  Reply,
  Send,
  Share2,
  Target,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

import { RichText } from "~/components/post/post-card";
import { Button } from "@wadzzo/ui/components/button";
import { Price } from "~/components/price/price";
import { Textarea } from "@wadzzo/ui/components/textarea";
import { env } from "~/env";
import { useBountySeen } from "~/hooks/use-bounty-attention";
import { useRequireAuth } from "~/hooks/use-require-auth";
import {
  ENTRY_STATUS,
  type BountyDetail,
  formatTokens,
  spotsFilled,
  viewerBadge,
} from "~/lib/bounty";
import { cn } from "@wadzzo/ui/lib/cn";
import { EmptyState } from "@wadzzo/ui/patterns/empty-state";
import { PageBody } from "@wadzzo/ui/patterns/page-header";
import { Avatar } from "@wadzzo/ui/patterns/person";
import { Skeleton } from "@wadzzo/ui/patterns/skeleton";
import { StatusPill } from "@wadzzo/ui/patterns/status-pill";
import { api } from "~/utils/api";

import { EntryDialog, type Entry, formatBytes, MediaTypeIcon } from "./entry-dialog";

const SECTIONS = [
  { id: "brief", label: "Brief", icon: FileText },
  { id: "entries", label: "My entries", icon: Upload },
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "discussion", label: "Discussion", icon: MessageCircle },
] as const;
type Section = (typeof SECTIONS)[number]["id"];

const isSection = (s: string | null | undefined): s is Section => SECTIONS.some((x) => x.id === s);

/**
 * A bounty: cover, title block, the brief / your entries / chat with the brand /
 * public discussion in tabs, and a reward card (stats + the one action that
 * fits where you stand) that stays beside them.
 */
export function BountyView({ initial }: { initial: BountyDetail }) {
  const params = useSearchParams();
  const [section, setSection] = useState<Section>(() =>
    isSection(params?.get("section")) ? (params.get("section") as Section) : "brief",
  );
  const [entryDialog, setEntryDialog] = useState<{
    editing: Entry | null;
  } | null>(null);
  const detail = api.bounty.byId.useQuery({ id: initial.id }, { initialData: initial });
  const b = detail.data;
  const markSeen = useBountySeen((s) => s.markSeen);
  useEffect(() => markSeen(b.id), [b.id, markSeen]);

  const joined = b.viewer.joined;
  const badge = viewerBadge(b);
  const cover = b.imageUrls[0] ?? null;
  const openSubmit = () => {
    setSection("entries");
    setEntryDialog({ editing: null });
  };

  return (
    <div>
      {/* Cover */}
      <div className="relative h-52 overflow-hidden sm:h-72 lg:h-80">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-[radial-gradient(circle_at_20%_30%,hsl(var(--primary)/0.35),transparent_60%),radial-gradient(circle_at_80%_70%,hsl(190_90%_50%/0.2),transparent_55%)]">
            <Target className="text-primary/60 size-16" />
          </div>
        )}
        <div className="via-background/30 to-background absolute inset-0 bg-gradient-to-b from-black/10" />
      </div>

      <PageBody wide className="relative -mt-24 space-y-8 pt-0 sm:-mt-28">
        <header className="space-y-4">
          <nav
            className="text-muted-foreground flex items-center gap-1.5 text-sm"
            aria-label="Breadcrumb"
          >
            <Link href="/bounties" className="hover:text-foreground">
              Bounties
            </Link>
            <span>/</span>
            <span className="text-foreground truncate">{b.title}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/creator/${b.brand.id}`}
              className="glass hover:border-primary/40 inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-semibold transition-colors"
            >
              <Avatar src={b.brand.avatarUrl} name={b.brand.name} className="size-7 text-[10px]" />
              {b.brand.name}
              <BadgeCheck className="text-primary size-4" />
            </Link>
            <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
          </div>
          <h1 className="font-hud max-w-4xl text-3xl leading-[1.1] font-bold tracking-tight sm:text-5xl">
            {b.title}
          </h1>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Reward card first on phones, beside the tabs on wide screens */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:order-2">
            <RewardCard b={b} onSubmit={openSubmit} onShowEntries={() => setSection("entries")} />
            <BrandCard b={b} />
          </aside>

          <div className="min-w-0 space-y-5 lg:order-1">
            <div
              className="glass flex w-full gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit"
              role="tablist"
            >
              {SECTIONS.map((s) => {
                const locked = !joined && (s.id === "entries" || s.id === "chat");
                const count =
                  s.id === "entries" && joined
                    ? b.viewer.entryCount
                    : s.id === "discussion"
                      ? b.commentCount
                      : 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={section === s.id}
                    onClick={() => setSection(s.id)}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors",
                      section === s.id
                        ? "bg-primary text-primary-foreground shadow-[0_0_20px_-6px_hsl(var(--primary)/0.8)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {locked ? <Lock className="size-3.5" /> : <s.icon className="size-4" />}
                    {s.label}
                    {count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[11px] tabular-nums",
                          section === s.id ? "bg-black/15" : "bg-foreground/10",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {section === "brief" && <Brief b={b} />}
            {section === "entries" &&
              (joined ? (
                <Entries b={b} onNew={openSubmit} onEdit={(e) => setEntryDialog({ editing: e })} />
              ) : (
                <Locked
                  title="Join to submit an entry"
                  text="Your entries are private between you and the brand."
                />
              ))}
            {section === "chat" &&
              (joined ? (
                <Chat b={b} />
              ) : (
                <Locked
                  title="Join to message the brand"
                  text="Ask questions privately once you've joined."
                />
              ))}
            {section === "discussion" && <Discussion bountyId={b.id} />}
          </div>
        </div>
      </PageBody>

      {entryDialog && (
        <EntryDialog
          bountyId={b.id}
          editing={entryDialog.editing}
          onClose={() => setEntryDialog(null)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── sidebar ───────────────────────────── */

function RewardCard({
  b,
  onSubmit,
  onShowEntries,
}: {
  b: BountyDetail;
  onSubmit: () => void;
  onShowEntries: () => void;
}) {
  const { signedIn, requireAuth } = useRequireAuth();
  const utils = api.useUtils();
  const join = api.bounty.join.useMutation({
    onSuccess: () => void utils.bounty.byId.invalidate({ id: b.id }),
  });
  const needsBalance = b.requiredBalance > 0 && !b.viewer.joined && b.open;
  const balance = api.user.platformBalance.useQuery(undefined, {
    enabled: signedIn && needsBalance,
  });
  const short = needsBalance && balance.data != null && balance.data.balance < b.requiredBalance;
  const filled = spotsFilled(b);
  const portal = env.NEXT_PUBLIC_BRAND_PORTAL_URL.replace(/\/$/, "");
  const cta = "h-12 w-full rounded-xl text-base font-bold";

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: b.title, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };

  return (
    <div className="glass space-y-5 rounded-2xl p-5 shadow-[0_20px_60px_-25px_hsl(var(--primary)/0.45)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-caps">Reward per winner</p>
          <Price
            tokens={b.rewardAsset}
            usd={b.rewardUsd}
            code={b.assetCode}
            size="xl"
            gradient
            className="mt-0.5"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="glass rounded-full"
          onClick={() => void share()}
          aria-label="Share"
        >
          <Share2 className="size-4" />
        </Button>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {[
          {
            icon: Trophy,
            label: "Spots left",
            value: `${b.spotsLeft}/${b.totalWinners}`,
          },
          {
            icon: Users,
            label: "Joined",
            value: b.participants.toLocaleString("en-US"),
          },
          {
            icon: Upload,
            label: "Entries",
            value: b.totalEntries.toLocaleString("en-US"),
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-foreground/[0.04] ring-foreground/[0.06] rounded-xl p-2.5 text-center ring-1"
          >
            <s.icon className="text-primary mx-auto mb-1 size-3.5" />
            <dd className="font-hud text-lg font-bold tabular-nums">{s.value}</dd>
            <dt className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
              {s.label}
            </dt>
          </div>
        ))}
      </dl>

      <div className="space-y-1.5">
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>Winner spots filled</span>
          <span className="tabular-nums">{filled}%</span>
        </div>
        <div className="bg-foreground/[0.08] h-2 overflow-hidden rounded-full">
          <div
            className="from-primary via-green-hot h-full rounded-full bg-gradient-to-r to-cyan-400 shadow-[0_0_12px_hsl(var(--primary)/0.6)]"
            style={{ width: `${Math.max(filled, 3)}%` }}
          />
        </div>
      </div>

      {b.viewer.won && (
        <p className="tone-warning flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold">
          <Trophy className="size-4" /> You won! The reward was sent to your wallet.
        </p>
      )}

      {b.isOwner ? (
        <Button asChild className={cta}>
          <a href={`${portal}/bounties/${b.id}`} target="_blank" rel="noreferrer">
            Manage in brand portal <ExternalLink className="size-4" />
          </a>
        </Button>
      ) : b.viewer.joined ? (
        <div className="space-y-2">
          {b.open && (
            <Button
              className={cn(cta, "shadow-[0_0_30px_-6px_hsl(var(--primary)/0.8)]")}
              onClick={onSubmit}
            >
              <Upload className="size-4" />{" "}
              {b.viewer.entryCount ? "Submit another entry" : "Submit your entry"}
            </Button>
          )}
          {b.viewer.entryCount > 0 && (
            <Button variant="outline" className="w-full rounded-xl" onClick={onShowEntries}>
              View my entries ({b.viewer.entryCount})
            </Button>
          )}
          {!b.open && !b.viewer.won && (
            <p className="text-muted-foreground text-center text-sm">This bounty has closed.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            className={cn(
              cta,
              b.open && !short && "shadow-[0_0_30px_-6px_hsl(var(--primary)/0.8)]",
            )}
            disabled={!b.open || join.isPending || short}
            onClick={requireAuth(() => join.mutate({ id: b.id }))}
          >
            {!b.open
              ? "This bounty is closed"
              : !signedIn
                ? "Sign in to join"
                : join.isPending
                  ? "Joining…"
                  : "Join bounty"}
          </Button>
          {needsBalance && (
            <p
              className={cn(
                "text-center text-xs",
                short ? "text-destructive font-semibold" : "text-muted-foreground",
              )}
            >
              Hold at least {b.requiredBalance.toLocaleString("en-US")} {b.assetCode} to join
              {short && balance.data && ` — you have ${formatTokens(balance.data.balance)}`}
              {short && (
                <>
                  {" · "}
                  <Link href="/wallet" className="underline">
                    Add funds
                  </Link>
                </>
              )}
            </p>
          )}
          {join.error && (
            <p className="tone-danger rounded-lg px-3 py-2 text-sm">{join.error.message}</p>
          )}
        </div>
      )}
    </div>
  );
}

function BrandCard({ b }: { b: BountyDetail }) {
  return (
    <Link
      href={`/creator/${b.brand.id}`}
      className="glass hover:border-primary/40 flex items-center gap-3 rounded-2xl p-4 transition-colors"
    >
      <Avatar src={b.brand.avatarUrl} name={b.brand.name} className="size-11" />
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
          Posted by
        </span>
        <span className="block truncate font-semibold">{b.brand.name}</span>
      </span>
      <BadgeCheck className="text-primary size-5" />
    </Link>
  );
}

/* ───────────────────────────── tabs ───────────────────────────── */

function Locked({ title, text }: { title: string; text: string }) {
  return <EmptyState icon={Lock} title={title} description={text} className="glass border-solid" />;
}

function Brief({ b }: { b: BountyDetail }) {
  const [active, setActive] = useState(0);
  const images = b.imageUrls;
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-5 sm:p-6">
        <RichText html={b.description} className="prose-base" />
      </div>
      {images.length > 1 && (
        <div className="space-y-2">
          <div className="glass overflow-hidden rounded-2xl p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[active]}
              alt=""
              className="aspect-video w-full rounded-xl object-cover"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "size-16 shrink-0 overflow-hidden rounded-lg ring-2 transition",
                  i === active ? "ring-primary" : "opacity-60 ring-transparent hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Entries({
  b,
  onNew,
  onEdit,
}: {
  b: BountyDetail;
  onNew: () => void;
  onEdit: (e: Entry) => void;
}) {
  const entries = api.bounty.entries.useQuery({ bountyId: b.id });
  const utils = api.useUtils();
  const remove = api.bounty.deleteEntry.useMutation({
    onSuccess: () =>
      void Promise.all([entries.refetch(), utils.bounty.byId.invalidate({ id: b.id })]),
  });

  if (entries.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (!entries.data?.length) {
    return (
      <EmptyState
        icon={Upload}
        title="No entries yet"
        description={
          b.open
            ? "Send your work to the brand — you can edit it until they open it."
            : "This bounty is closed."
        }
        action={
          b.open ? (
            <Button className="rounded-xl" onClick={onNew}>
              Submit your entry
            </Button>
          ) : undefined
        }
        className="glass border-solid"
      />
    );
  }
  return (
    <ul className="space-y-3">
      {entries.data.map((e) => {
        const st = ENTRY_STATUS[e.status];
        const editable = e.status === "UNCHECKED" && b.open;
        return (
          <li key={e.id} className="glass space-y-3 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <StatusPill tone={st.tone} dot>
                {st.label}
              </StatusPill>
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                {formatDistanceToNow(new Date(e.createdAt), {
                  addSuffix: true,
                })}
                {editable && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => onEdit(e)}
                      aria-label="Edit entry"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hover:text-destructive size-8"
                      onClick={() => remove.mutate({ entryId: e.id })}
                      aria-label="Delete entry"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <RichText html={e.content} />
            {e.medias.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {e.medias.map((m) => (
                  <li key={m.id}>
                    <Attachment m={m} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
      {b.open && (
        <Button variant="outline" className="w-full rounded-xl" onClick={onNew}>
          <Upload className="size-4" /> Submit another entry
        </Button>
      )}
    </ul>
  );
}

function Chat({ b }: { b: BountyDetail }) {
  const thread = api.bounty.thread.useQuery({ bountyId: b.id }, { refetchInterval: 15_000 });
  const [text, setText] = useState("");
  const send = api.bounty.sendMessage.useMutation({
    onSuccess: () => (setText(""), void thread.refetch()),
  });
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [thread.data?.length]);

  return (
    <div className="glass flex h-[32rem] flex-col overflow-hidden rounded-2xl">
      <div className="border-foreground/[0.06] flex items-center gap-3 border-b px-4 py-3">
        <Avatar src={b.brand.avatarUrl} name={b.brand.name} className="size-8 text-xs" />
        <div>
          <p className="text-sm font-semibold">{b.brand.name}</p>
          <p className="text-muted-foreground text-[11px]">
            Private — only you and the brand see this
          </p>
        </div>
      </div>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {thread.isLoading && <Skeleton className="h-10 w-1/2 rounded-2xl" />}
        {!thread.isLoading && !thread.data?.length && (
          <li className="text-muted-foreground m-auto max-w-xs text-center text-sm">
            <MessagesSquare className="text-primary mx-auto mb-2 size-6" />
            Ask {b.brand.name} anything about this bounty.
          </li>
        )}
        {thread.data?.map((m) => (
          <li
            key={m.id}
            className={cn(
              "flex max-w-[85%] items-end gap-2",
              m.fromBrand ? "self-start" : "flex-row-reverse self-end",
            )}
          >
            {m.fromBrand && (
              <Avatar src={b.brand.avatarUrl} name={b.brand.name} className="size-6 text-[9px]" />
            )}
            <div
              className={cn(
                "rounded-2xl px-3.5 py-2 text-sm",
                m.fromBrand
                  ? "bg-foreground/[0.07] rounded-bl-md"
                  : "bg-primary text-primary-foreground rounded-br-md",
              )}
            >
              <p className="break-words whitespace-pre-line">{m.content}</p>
              <p
                className={cn(
                  "mt-0.5 text-[10px]",
                  m.fromBrand ? "text-muted-foreground" : "text-primary-foreground/70",
                )}
              >
                {formatDistanceToNow(new Date(m.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </li>
        ))}
        <li ref={end} aria-hidden />
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate({ bountyId: b.id, content: text.trim() });
        }}
        className="border-foreground/[0.06] flex gap-2 border-t p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder={`Message ${b.brand.name}…`}
          className="bg-foreground/[0.05] ring-foreground/10 focus:ring-primary/50 h-11 min-w-0 flex-1 rounded-xl px-3.5 text-sm ring-1 outline-none"
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 rounded-xl"
          disabled={send.isPending || !text.trim()}
          aria-label="Send"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function Discussion({ bountyId }: { bountyId: number }) {
  const { signedIn, requireAuth } = useRequireAuth();
  const comments = api.bounty.comments.useQuery({ bountyId });
  const utils = api.useUtils();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);
  const add = api.bounty.addComment.useMutation({
    onSuccess: () => {
      setText("");
      setReplyTo(null);
      void Promise.all([comments.refetch(), utils.bounty.byId.invalidate({ id: bountyId })]);
    },
  });
  const remove = api.bounty.deleteComment.useMutation({
    onSuccess: () => void comments.refetch(),
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          requireAuth(() => {
            if (text.trim())
              add.mutate({
                bountyId,
                content: text.trim(),
                parentId: replyTo?.id,
              });
          })();
        }}
        className="glass space-y-2 rounded-2xl p-3"
      >
        {replyTo && (
          <p className="bg-primary/10 text-primary flex items-center justify-between rounded-lg px-3 py-1.5 text-xs">
            Replying to {replyTo.name}
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X className="size-3.5" />
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={
              signedIn ? "Share a thought or ask the community…" : "Sign in to join the discussion"
            }
            className="bg-foreground/[0.04] resize-none rounded-xl border-0"
          />
          <Button
            type="submit"
            className="rounded-xl"
            disabled={add.isPending || (signedIn && !text.trim())}
          >
            {signedIn ? "Post" : "Sign in"}
          </Button>
        </div>
      </form>

      {comments.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : !comments.data?.length ? (
        <EmptyState
          icon={MessageCircle}
          title="No comments yet"
          description="Start the conversation."
          className="glass border-solid"
        />
      ) : (
        <ul className="space-y-3">
          {comments.data.map((c) => (
            <li key={c.id} className="glass space-y-3 rounded-2xl p-4">
              {[c, ...c.replies].map((r, i) => (
                <div
                  key={r.id}
                  className={cn("flex gap-3", i > 0 && "border-foreground/10 ml-6 border-l pl-4")}
                >
                  <Avatar src={r.author.image} name={r.author.name} className="size-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{r.author.name ?? "Fan"}</span>{" "}
                      <span className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(r.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </p>
                    <p className="text-foreground/90 text-sm break-words whitespace-pre-line">
                      {r.content}
                    </p>
                    <div className="text-muted-foreground mt-1 flex gap-3 text-xs">
                      {i === 0 && (
                        <button
                          type="button"
                          onClick={requireAuth(() =>
                            setReplyTo({
                              id: c.id,
                              name: c.author.name ?? "Fan",
                            }),
                          )}
                          className="hover:text-foreground inline-flex items-center gap-1"
                        >
                          <Reply className="size-3.5" /> Reply
                        </button>
                      )}
                      {r.mine && (
                        <button
                          type="button"
                          onClick={() => remove.mutate({ commentId: r.id })}
                          className="hover:text-destructive inline-flex items-center gap-1"
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Attachment({ m }: { m: Entry["medias"][number] }) {
  if (m.type.startsWith("image/")) {
    return (
      <a
        href={m.url}
        target="_blank"
        rel="noreferrer"
        className="ring-foreground/10 block overflow-hidden rounded-xl ring-1"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.url} alt={m.name} className="aspect-video w-full object-cover" />
      </a>
    );
  }
  return (
    <a
      href={m.url}
      target="_blank"
      rel="noreferrer"
      className="bg-foreground/[0.04] ring-foreground/[0.06] hover:bg-primary/10 flex items-center gap-3 rounded-xl p-3 ring-1"
    >
      <MediaTypeIcon type={m.type} className="text-primary size-5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{m.name}</span>
        <span className="text-muted-foreground text-[11px]">{formatBytes(m.size)}</span>
      </span>
      <Paperclip className="text-muted-foreground size-4" />
    </a>
  );
}
