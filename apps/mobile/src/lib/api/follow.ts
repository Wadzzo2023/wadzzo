import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";

import { api } from "./client";
import type { ArBrand, FollowResult } from "./types";

type Phase = "preparing" | "confirming" | "unfollowing";
const LABEL: Record<Phase, string> = {
  preparing: "Preparing",
  confirming: "Confirming",
  unfollowing: "Unfollowing",
};

/**
 * Port of the web's `useToggleFollow`. Following is a trustline, not a
 * bookmark (docs/02-api.md): custodial accounts are one call — the server
 * co-signs and submits; an Albedo account gets `needsSignature` back and is
 * sent to Albedo to approve, which finishes the follow.
 */
export function useToggleFollow() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ id: string; phase: Phase } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settle = () =>
    Promise.all(["brands", "brand", "pins", "pin", "brandPins"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const follow = async (brandId: string) => {
    setError(null);
    setPending({ id: brandId, phase: "preparing" });
    try {
      const res = await api<FollowResult>(`/brands/${encodeURIComponent(brandId)}/follow`, { method: "POST", body: {} });
      if ("needsSignature" in res) {
        router.push({ pathname: "/auth/albedo", params: { xdr: res.xdr, brandId } });
        return;
      }
      setPending({ id: brandId, phase: "confirming" });
      await settle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not follow this brand.");
    } finally {
      setPending(null);
    }
  };

  const unfollow = async (brandId: string) => {
    setError(null);
    setPending({ id: brandId, phase: "unfollowing" });
    try {
      await api(`/brands/${encodeURIComponent(brandId)}/follow`, { method: "DELETE" });
      await settle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unfollow.");
    } finally {
      setPending(null);
    }
  };

  return {
    error,
    pendingId: pending?.id ?? null,
    labelFor: (b: Pick<ArBrand, "id" | "followed">) =>
      pending?.id === b.id ? LABEL[pending.phase] : b.followed ? "Following" : "Follow",
    toggle: (b: Pick<ArBrand, "id" | "followed">) => {
      if (pending) return;
      void (b.followed ? unfollow(b.id) : follow(b.id));
    },
  };
}
