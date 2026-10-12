import { useCallback, useMemo, useRef } from "react";

import type { GeoFix } from "@wadzzo/ar-core/ar/types";
import { api } from "~/utils/api";

import {
  MATCH_SIMILARITY,
  type ScanResult,
  type ScanPlatform,
} from "@wadzzo/ar-core/murals/constants";
import { bestSimilarity } from "@wadzzo/ar-core/murals/score";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * ── Murals data hooks ──────────────────────────────────────────────────────
 *
 * Thin wrappers over `api.murals.*` / `api.coins.*` for the web screens.
 */

/** Rounded so small GPS wobble doesn't refetch; ~110 m grid. */
const grid = (v: number) => Math.round(v * 1000) / 1000;

export function useNearbyMurals(fix: GeoFix | null) {
  const lat = fix ? grid(fix.lat) : null;
  const lng = fix ? grid(fix.lng) : null;
  const query = api.murals.nearby.useQuery(
    { lat: lat ?? 0, lng: lng ?? 0 },
    {
      enabled: lat != null && lng != null,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  );
  const murals = useMemo(() => query.data?.murals ?? [], [query.data]);

  /** Device-side pre-match (plan §3.1) — UX only; the server decides. */
  const matchVector = useCallback(
    (vector: number[] | null) => {
      if (!vector) return null;
      let best: { mural: (typeof murals)[number]; similarity: number } | null = null;
      for (const m of murals) {
        if (m.embeddings.length === 0) continue;
        const similarity = bestSimilarity(m.embeddings, [vector]);
        if (!best || similarity > best.similarity) best = { mural: m, similarity };
      }
      return best && best.similarity >= MATCH_SIMILARITY ? best.mural : null;
    },
    [murals],
  );

  return {
    murals,
    dailyLimit: query.data?.dailyLimit ?? null,
    matchVector,
    refetch: query.refetch,
  };
}

export type SubmitArgs = {
  frames: [Blob, Blob, Blob]; // left, centre, right
  fix: GeoFix;
  sweep: { spanDeg: number; durationMs: number };
  platform: ScanPlatform;
};

/**
 * start → upload 3 keyframes straight to S3 → submit. Resolves to the
 * `ScanResult` the result screen renders; network/server failures throw.
 */
export function useSubmitMuralScan() {
  const utils = api.useUtils();
  const start = api.murals.startScan.useMutation();
  const submit = api.murals.submitScan.useMutation();
  const busy = useRef(false);

  const run = useCallback(
    async ({ frames, fix, sweep, platform }: SubmitArgs): Promise<ScanResult> => {
      if (busy.current)
        throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
          message: "A scan is already being sent",
        });
      busy.current = true;
      try {
        const started = await start.mutateAsync({
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
        });
        if (!started.ok)
          return {
            kind: "rejected",
            code: started.code,
            message: started.message,
            retryable: started.retryable,
          };

        await Promise.all(
          started.frames.map(async ({ uploadUrl }, i) => {
            const res = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": "image/jpeg" },
              body: frames[i],
            });
            if (!res.ok)
              throw new AppError(ErrorCodes.UPLOAD_FAILED, {
                message: "Upload failed — check your connection and try again",
              });
          }),
        );

        const result = await submit.mutateAsync({
          sessionId: started.sessionId,
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          sweep,
          platform,
        });
        if (result.kind !== "rejected") {
          void utils.murals.nearby.invalidate();
          void utils.murals.inArea.invalidate();
          void utils.murals.mine.invalidate();
          utils.coins.balance.setData(undefined, { balance: result.balance });
        }
        return result;
      } finally {
        busy.current = false;
      }
    },
    [start, submit, utils],
  );

  return { run };
}

export function useNameMural() {
  const utils = api.useUtils();
  return api.murals.name.useMutation({
    onSuccess: () => {
      void utils.murals.invalidate();
    },
  });
}

export function useCoinBalance(enabled: boolean) {
  return api.coins.balance.useQuery(undefined, { enabled, staleTime: 30_000 });
}
