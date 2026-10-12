import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { Platform } from "react-native";

import { api } from "~/lib/api/client";
import { useUid } from "~/lib/api/queries";

import { MATCH_SIMILARITY, type MuralCard, type RejectCode, type ScanResult } from "./constants";
import { bestSimilarity } from "./score";

/**
 * ── Murals API (REST mirrors of wadzzoAR `murals.*` / `coins.*`) ───────────
 *
 * Contract: wadzzoAR `src/server/mobile/routes.ts` › "Murals + coins".
 */

export type NearbyMural = MuralCard & { distanceM: number; scansToday: number; embeddings: number[][] };
export type AreaMural = MuralCard & { scansToday: number };
export type MyMural = MuralCard & {
  myPhotoUrl: string;
  myScans: number;
  coinsEarned: number;
  rank: number | null;
  lastScannedAt: string;
};
export type MuralDetail = {
  mural: MuralCard;
  mine: null | {
    scansToday: number;
    dailyLimit: number;
    totalScans: number;
    coinsEarned: number;
    rank: number | null;
    canName: boolean;
    history: { id: string; createdAt: string; coinsAwarded: number; keyframes: string[] }[];
  };
} | null;
export type CoinRow = {
  id: string;
  amount: number;
  reason: "MURAL_SCAN" | "MURAL_DISCOVERY" | "MURAL_REVOKE" | "ADMIN_ADJUST";
  note: string | null;
  createdAt: string;
  mural: { id: string; title: string } | null;
};

const mk = {
  nearby: (uid: string | null, lat: number, lng: number) => ["murals", "nearby", uid, lat, lng] as const,
  area: (uid: string | null, a: object) => ["murals", "area", uid, a] as const,
  byId: (uid: string | null, id: string) => ["murals", "byId", uid, id] as const,
  mine: (uid: string | null) => ["murals", "mine", uid] as const,
  coins: (uid: string | null) => ["coins", uid] as const,
  history: (uid: string | null) => ["coins", "history", uid] as const,
};

/** ~110 m grid so GPS wobble doesn't refetch. */
const grid = (v: number) => Math.round(v * 1000) / 1000;

export function useNearbyMurals(fix: { lat: number; lng: number } | null) {
  const uid = useUid();
  const lat = fix ? grid(fix.lat) : 0;
  const lng = fix ? grid(fix.lng) : 0;
  const q = useQuery({
    queryKey: mk.nearby(uid, lat, lng),
    queryFn: () => api<{ dailyLimit: number; murals: NearbyMural[] }>("/murals/nearby", { query: { lat, lng } }),
    enabled: fix != null,
    staleTime: 60_000,
  });
  const murals = useMemo(() => q.data?.murals ?? [], [q.data]);
  const matchVector = useCallback(
    (v: number[] | null) => {
      if (!v) return null;
      let best: { m: NearbyMural; s: number } | null = null;
      for (const m of murals) {
        if (!m.embeddings.length) continue;
        const s = bestSimilarity(m.embeddings, v);
        if (!best || s > best.s) best = { m, s };
      }
      return best && best.s >= MATCH_SIMILARITY ? best.m : null;
    },
    [murals],
  );
  return { murals, dailyLimit: q.data?.dailyLimit ?? null, matchVector };
}

export function useMuralsInArea(area: { n: number; s: number; e: number; w: number } | null, includeUnverified: boolean, enabled: boolean) {
  const uid = useUid();
  return useQuery({
    queryKey: mk.area(uid, { ...area, includeUnverified }),
    queryFn: () =>
      api<{ dailyLimit: number; murals: AreaMural[] }>("/murals", {
        query: { ...area!, unverified: includeUnverified ? "true" : "false" },
      }),
    enabled: enabled && area != null,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useMural(id: string) {
  const uid = useUid();
  return useQuery({ queryKey: mk.byId(uid, id), queryFn: () => api<MuralDetail>(`/murals/${id}`), enabled: Boolean(id) });
}

export function useMyMurals(enabled: boolean) {
  const uid = useUid();
  return useInfiniteQuery({
    queryKey: mk.mine(uid),
    queryFn: ({ pageParam }) =>
      api<{ total: number; nextCursor: number | null; items: MyMural[] }>("/me/murals", { query: { cursor: pageParam, limit: 24 } }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useCoinBalance(enabled: boolean) {
  const uid = useUid();
  return useQuery({ queryKey: mk.coins(uid), queryFn: () => api<{ balance: number }>("/me/coins"), enabled, staleTime: 30_000 });
}

export function useCoinHistory(enabled: boolean) {
  const uid = useUid();
  return useInfiniteQuery({
    queryKey: mk.history(uid),
    queryFn: ({ pageParam }) =>
      api<{ items: CoinRow[]; nextCursor: string | null }>("/me/coins/history", { query: { cursor: pageParam, limit: 30 } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useNameMural() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { muralId: string; title: string; artist?: string }) =>
      api<{ named: boolean; title: string | null; artist: string | null }>(`/murals/${v.muralId}`, {
        method: "PATCH",
        body: { title: v.title, artist: v.artist },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["murals"] }),
  });
}

type Started =
  | { ok: true; sessionId: string; frames: { uploadUrl: string }[] }
  | { ok: false; kind: "rejected"; code: RejectCode; message: string; retryable: boolean };

/** start → PUT 3 keyframes to S3 → submit. Resolves to what the result screen renders. */
export function useSubmitMuralScan() {
  const qc = useQueryClient();
  const uid = useUid();
  const busy = useRef(false);

  const run = useCallback(
    async (args: {
      files: [string, string, string]; // file paths: left, centre, right
      fix: { lat: number; lng: number; accuracy: number; mocked?: boolean };
      sweep: { spanDeg: number; durationMs: number };
    }): Promise<ScanResult> => {
      if (busy.current) throw new Error("A scan is already being sent");
      busy.current = true;
      try {
        const { fix } = args;
        const started = await api<Started>("/murals/scans", {
          method: "POST",
          body: { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy },
        });
        if (!started.ok) return { kind: "rejected", code: started.code, message: started.message, retryable: started.retryable };

        await Promise.all(
          started.frames.map(async ({ uploadUrl }, i) => {
            const path = args.files[i]!;
            const blob = await (await fetch(path.startsWith("file://") ? path : `file://${path}`)).blob();
            const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
            if (!res.ok) throw new Error("Upload failed — check your connection and try again");
          }),
        );

        const result = await api<ScanResult>(`/murals/scans/${started.sessionId}/submit`, {
          method: "POST",
          body: {
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
            mock: fix.mocked ?? false,
            sweep: args.sweep,
            platform: Platform.OS === "ios" ? "ios" : "android",
          },
        });
        if (result.kind !== "rejected") {
          void qc.invalidateQueries({ queryKey: ["murals"] });
          qc.setQueryData(mk.coins(uid), { balance: result.balance });
          void qc.invalidateQueries({ queryKey: mk.history(uid) });
        }
        return result;
      } finally {
        busy.current = false;
      }
    },
    [qc, uid],
  );

  return { run };
}
