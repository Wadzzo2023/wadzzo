import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { useSession } from "~/lib/auth/session";
import { persistStorage } from "~/lib/storage";

import { api } from "./client";
import type {
  AnnouncementPage,
  ArAnnouncement,
  ArBrand,
  ArCommentTarget,
  ArEventDetail,
  ArPin,
  AttentionItem,
  Balance,
  BountyCard,
  BountyDetail,
  BountyPage,
  CollectionPage,
  Comment,
  Entry,
  EventComment,
  EventPage,
  PinPage,
  Profile,
  ThreadMessage,
} from "./types";

/**
 * ── Query hooks ────────────────────────────────────────────────────────────
 *
 * One hook per resource, keyed so a sign-in/out refetches everything that
 * depends on who's looking (`uid` is part of every key whose answer changes
 * with the viewer: pins' locked/collected flags, brands' followed flag…).
 */

export const useUid = () => useSession((s) => s.user?.id ?? null);
const useSignedIn = () => useSession((s) => Boolean(s.user));

export const qk = {
  // Prefix ["pins"] still matches every area for invalidation.
  pins: (uid: string | null, area: PinArea | null) => ["pins", uid, area] as const,
  pin: (id: string, uid: string | null) => ["pin", id, uid] as const,
  brands: (uid: string | null) => ["brands", uid] as const,
  brand: (id: string, uid: string | null) => ["brand", id, uid] as const,
  brandPins: (id: string, tab: string, uid: string | null) => ["brandPins", id, tab, uid] as const,
  collection: (uid: string | null, query: string, sort: string) => ["collection", uid, query, sort] as const,
  profile: (uid: string | null) => ["profile", uid] as const,
  balance: (uid: string | null) => ["balance", uid] as const,
  bounties: (uid: string | null, filter: string, search: string) => ["bounties", uid, filter, search] as const,
  myBounties: (uid: string | null) => ["myBounties", uid] as const,
  bounty: (id: number, uid: string | null) => ["bounty", id, uid] as const,
  entries: (id: number, uid: string | null) => ["entries", id, uid] as const,
  comments: (id: number, uid: string | null) => ["comments", id, uid] as const,
  thread: (id: number, uid: string | null) => ["thread", id, uid] as const,
  attention: (uid: string | null) => ["attention", uid] as const,
  pinSearch: (uid: string | null, q: string) => ["pinSearch", uid, q] as const,
  events: (uid: string | null, when: string, following: boolean) => ["events", uid, when, following] as const,
  event: (id: string, uid: string | null) => ["event", id, uid] as const,
  announcements: (uid: string | null, following: boolean) => ["announcements", uid, following] as const,
  announcement: (id: string) => ["announcement", id] as const,
  eventComments: (kind: string, id: string, uid: string | null) => ["eventComments", kind, id, uid] as const,
};

// ── Pins ─────────────────────────────────────────────────────────────────

/**
 * Where to load pins for: a circle, or "world" (every live pin, for a map
 * zoomed out past what a circle can sensibly cover). `null` = not known yet
 * (no location and no map view) — nothing is fetched.
 */
export type PinArea = { lat: number; lng: number; radiusKm: number } | "world";

export function usePinsQuery(area: PinArea | null) {
  const uid = useUid();
  const q = useQuery({
    queryKey: qk.pins(uid, area),
    // Passing React Query's signal is what makes it cancel: when the area
    // changes (you zoom/pan again) the old key loses its last observer and
    // its in-flight request is aborted, so only the newest area downloads.
    queryFn: ({ signal }) =>
      api<ArPin[]>(area && area !== "world" ? `/pins?lat=${area.lat}&lng=${area.lng}&radiusKm=${area.radiusKm}` : "/pins", { signal }),
    enabled: area != null,
    staleTime: 30_000,
    // Moving to a new area keeps the current pins up until the new ones land
    // (no empty-map flash between areas).
    placeholderData: keepPreviousData,
  });
  return { ...q, pins: q.data ?? EMPTY_PINS };
}
const EMPTY_PINS: ArPin[] = [];

export function usePinQuery(id: string | null) {
  const uid = useUid();
  return useQuery({
    queryKey: qk.pin(id ?? "", uid),
    queryFn: () => api<ArPin>(`/pins/${encodeURIComponent(id!)}`),
    enabled: Boolean(id),
  });
}

export function useCollectedQuery(args: { query: string; sort: "newest" | "rarest" | "brand"; rarity?: string; pageSize?: number }) {
  const uid = useUid();
  const q = useInfiniteQuery({
    queryKey: [...qk.collection(uid, args.query, args.sort), args.rarity ?? "all"],
    queryFn: ({ pageParam }) =>
      api<CollectionPage>("/me/collection", {
        query: { limit: args.pageSize ?? 24, cursor: pageParam, query: args.query, sort: args.sort, rarity: args.rarity ?? "all" },
      }),
    initialPageParam: 0 as number,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(uid),
  });
  const pins = useMemo(() => q.data?.pages.flatMap((p) => p.pins) ?? [], [q.data]);
  return { ...q, pins, facets: q.data?.pages[0]?.facets ?? null, total: q.data?.pages[0]?.total ?? 0 };
}

export function useBrandPinsQuery(args: { brandId: string | null; tab: "live" | "yours"; pageSize?: number }) {
  const uid = useUid();
  const signedIn = useSignedIn();
  const q = useInfiniteQuery({
    queryKey: qk.brandPins(args.brandId ?? "", args.tab, uid),
    queryFn: ({ pageParam }) =>
      api<PinPage>(`/brands/${encodeURIComponent(args.brandId!)}/pins`, {
        query: { tab: args.tab, limit: args.pageSize ?? 24, cursor: pageParam },
      }),
    initialPageParam: 0 as number,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(args.brandId) && (args.tab === "live" || signedIn),
  });
  const pins = useMemo(() => q.data?.pages.flatMap((p) => p.pins) ?? [], [q.data]);
  return { ...q, pins, total: q.data?.pages[0]?.total ?? 0 };
}

export function useCollectPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; lat: number; lng: number }) =>
      api(`/pins/${encodeURIComponent(v.id)}/collect`, { method: "POST", body: { lat: v.lat, lng: v.lng } }),
    onSuccess: () => invalidateAfterClaim(qc),
  });
}

export function useCollectByQr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/pins/${encodeURIComponent(id)}/collect-qr`, { method: "POST" }),
    onSuccess: () => invalidateAfterClaim(qc),
  });
}

function invalidateAfterClaim(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all(
    ["pins", "pin", "collection", "brandPins", "profile", "brands", "brand"].map((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    ),
  );
}

/**
 * Server-side drop search (`/pins/search`): every live drop, not only the
 * ones loaded for the area on screen. Ranked by relevance on the server.
 * `near` only picks which point of a multi-point drop comes back, so it's
 * read at fetch time and left out of the key — a moving GPS fix shouldn't
 * refire the search.
 */
export function usePinSearch(q: string, near: { lat: number; lng: number } | null, enabled = true) {
  const uid = useUid();
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);
  const term = q.trim();
  return useQuery({
    queryKey: qk.pinSearch(uid, term.toLowerCase()),
    queryFn: ({ signal }) =>
      api<ArPin[]>("/pins/search", {
        query: { q: term, lat: nearRef.current?.lat, lng: nearRef.current?.lng, limit: 12 },
        signal,
      }),
    enabled: enabled && term.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

// ── Brands ───────────────────────────────────────────────────────────────

export function useBrandsQuery() {
  const uid = useUid();
  const q = useQuery({ queryKey: qk.brands(uid), queryFn: () => api<ArBrand[]>("/brands"), staleTime: 60_000 });
  return { ...q, brands: q.data ?? EMPTY_BRANDS };
}
const EMPTY_BRANDS: ArBrand[] = [];

export function useBrandQuery(id: string | null) {
  const uid = useUid();
  return useQuery({
    queryKey: qk.brand(id ?? "", uid),
    queryFn: () => api<ArBrand>(`/brands/${encodeURIComponent(id!)}`),
    enabled: Boolean(id),
  });
}

// ── Me ───────────────────────────────────────────────────────────────────

export function useProfileQuery() {
  const uid = useUid();
  return useQuery({ queryKey: qk.profile(uid), queryFn: () => api<Profile>("/me/profile"), enabled: Boolean(uid) });
}

export function useBalanceQuery(enabled = true) {
  const uid = useUid();
  return useQuery({
    queryKey: qk.balance(uid),
    queryFn: () => api<Balance>("/me/balance"),
    enabled: Boolean(uid) && enabled,
    staleTime: 30_000,
  });
}

// ── Bounty ───────────────────────────────────────────────────────────────

export function useBountiesQuery(filter: "open" | "ending" | "top", search: string, enabled = true) {
  const uid = useUid();
  const q = useInfiniteQuery({
    queryKey: qk.bounties(uid, filter, search),
    queryFn: ({ pageParam }) =>
      api<BountyPage>("/bounties", { query: { filter, search, limit: 12, cursor: pageParam } }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    placeholderData: (prev) => prev,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  return { ...q, items };
}

export function useMyBountiesQuery() {
  const uid = useUid();
  return useQuery({ queryKey: qk.myBounties(uid), queryFn: () => api<BountyCard[]>("/me/bounties"), enabled: Boolean(uid) });
}

export function useBountyQuery(id: number) {
  const uid = useUid();
  return useQuery({
    queryKey: qk.bounty(id, uid),
    queryFn: () => api<BountyDetail>(`/bounties/${id}`),
    enabled: Number.isInteger(id),
    retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2,
  });
}

export function useEntriesQuery(id: number, enabled: boolean) {
  const uid = useUid();
  return useQuery({ queryKey: qk.entries(id, uid), queryFn: () => api<Entry[]>(`/bounties/${id}/entries`), enabled: Boolean(uid) && enabled });
}

export function useCommentsQuery(id: number) {
  const uid = useUid();
  return useQuery({ queryKey: qk.comments(id, uid), queryFn: () => api<Comment[]>(`/bounties/${id}/comments`) });
}

export function useThreadQuery(id: number, enabled: boolean) {
  const uid = useUid();
  return useQuery({
    queryKey: qk.thread(id, uid),
    queryFn: () => api<ThreadMessage[]>(`/bounties/${id}/thread`),
    enabled: Boolean(uid) && enabled,
    // No push channel (none in v1); poll while the chat is on screen.
    refetchInterval: enabled ? 15_000 : false,
  });
}

// ── Bounty attention (dots) ──────────────────────────────────────────────

interface SeenState {
  seen: Record<number, string>;
  markSeen: (bountyId: number) => void;
}

/** Per-device read state, same design as the web's `useBountySeen`. */
export const useBountySeen = create<SeenState>()(
  persist(
    (set) => ({
      seen: {},
      markSeen: (bountyId) => set((s) => ({ seen: { ...s.seen, [bountyId]: new Date().toISOString() } })),
    }),
    { name: "wadzzo-bounty-seen", storage: persistStorage },
  ),
);

export function useBountyAttention() {
  const uid = useUid();
  const seen = useBountySeen((s) => s.seen);
  const q = useQuery({
    queryKey: qk.attention(uid),
    queryFn: () => api<AttentionItem[]>("/me/bounty-attention"),
    enabled: Boolean(uid),
    staleTime: 60_000,
  });
  const unseen = useMemo(
    () =>
      (q.data ?? []).filter((item) => {
        const last = seen[item.bountyId];
        return !last || new Date(item.at).getTime() > new Date(last).getTime();
      }),
    [q.data, seen],
  );
  return { unseen, count: unseen.length, ready: !uid || q.isSuccess };
}

// ── Events & announcements ───────────────────────────────────────────────

export function useEventsQuery(when: "upcoming" | "past", following: boolean, enabled = true) {
  const uid = useUid();
  const q = useInfiniteQuery({
    queryKey: qk.events(uid, when, following),
    queryFn: ({ pageParam }) =>
      api<EventPage>("/events", { query: { when, following: following || undefined, limit: 12, cursor: pageParam } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    placeholderData: (prev) => prev,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  return { ...q, items };
}

export function useEventQuery(id: string) {
  const uid = useUid();
  return useQuery({
    queryKey: qk.event(id, uid),
    queryFn: () => api<ArEventDetail>(`/events/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
    retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2,
  });
}

export function useAnnouncementsQuery(following: boolean, enabled = true) {
  const uid = useUid();
  const q = useInfiniteQuery({
    queryKey: qk.announcements(uid, following),
    queryFn: ({ pageParam }) =>
      api<AnnouncementPage>("/announcements", { query: { following: following || undefined, limit: 12, cursor: pageParam } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    placeholderData: (prev) => prev,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  return { ...q, items };
}

export function useAnnouncementQuery(id: string) {
  return useQuery({
    queryKey: qk.announcement(id),
    queryFn: () => api<ArAnnouncement>(`/announcements/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
    retry: (n, e) => (e as { status?: number }).status !== 404 && n < 2,
  });
}

const targetPath = (t: ArCommentTarget) =>
  `/${t.kind === "event" ? "events" : "announcements"}/${encodeURIComponent(t.id)}`;

export function useEventCommentsQuery(target: ArCommentTarget) {
  const uid = useUid();
  return useQuery({
    queryKey: qk.eventComments(target.kind, target.id, uid),
    queryFn: () => api<EventComment[]>(`${targetPath(target)}/comments`),
  });
}

/** Refreshes the thread and the counts shown on the item after a change. */
function invalidateTarget(qc: ReturnType<typeof useQueryClient>, target: ArCommentTarget) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["eventComments", target.kind, target.id] }),
    qc.invalidateQueries({ queryKey: target.kind === "event" ? ["event", target.id] : ["announcement", target.id] }),
    qc.invalidateQueries({ queryKey: [target.kind === "event" ? "events" : "announcements"] }),
  ]);
}

export function useAddEventComment(target: ArCommentTarget) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api(`${targetPath(target)}/comments`, { method: "POST", body: { content } }),
    onSuccess: () => invalidateTarget(qc, target),
  });
}

export function useDeleteEventComment(target: ArCommentTarget) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api(`/${target.kind}-comments/${encodeURIComponent(commentId)}`, { method: "DELETE" }),
    onSuccess: () => invalidateTarget(qc, target),
  });
}

export function useRsvp(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (going: boolean) =>
      api<{ going: boolean; goingCount: number }>(`/events/${encodeURIComponent(eventId)}/rsvp`, {
        method: "POST",
        body: { going },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["event", eventId] }),
        qc.invalidateQueries({ queryKey: ["events"] }),
      ]),
  });
}
