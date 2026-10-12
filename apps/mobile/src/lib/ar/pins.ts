import { useMemo } from "react";

import { useBrandsQuery, usePinsQuery, type PinArea } from "~/lib/api/queries";

import { useSettings } from "./feedback";
import { distanceMeters } from "./geo";
import { pinStatus } from "./rarity";
import type { ArPin, Coords, GeoFix } from "./types";

/** Ported from wadzzoAR/src/lib/ar/usePins.ts — same filters and rules. */

export type PinFilterId = "all" | "following" | "available" | "collected";

export const PIN_FILTERS: { id: PinFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "available", label: "Available" },
  { id: "collected", label: "Collected" },
];

export function filterPins(pins: ArPin[], filter: PinFilterId, followedBrandIds: Set<string>): ArPin[] {
  switch (filter) {
    case "following":
      return pins.filter((p) => followedBrandIds.has(p.brandId));
    case "available":
      return pins.filter((p) => pinStatus(p) === "collectible");
    case "collected":
      return pins.filter((p) => p.collected);
    default:
      return pins;
  }
}

export function sortByDistance(pins: ArPin[], fix: GeoFix | null) {
  if (!fix) return pins.map((pin) => ({ pin, distance: Number.POSITIVE_INFINITY }));
  return pins.map((pin) => ({ pin, distance: distanceMeters(fix, pin) })).sort((a, b) => a.distance - b.distance);
}

/** Nearby-first: the smallest circle, loaded as soon as there's a location. */
export const NEAR_RADIUS_KM = 25;
/** Beyond this a circle stops being useful — the whole world is loaded. */
const WORLD_RADIUS_KM = 1500;
/** Radii are snapped to these, so zooming a little doesn't refetch. */
const RADII = [25, 50, 100, 200, 400, 800, 1500];

/**
 * The area to load pins for, from a centre (your location, or where the map
 * is looking) and how much ground needs covering. The centre is snapped to a
 * grid a quarter of the radius wide, so the request only changes once you've
 * moved or panned a real distance — not on every GPS tick or small drag.
 */
export function pinArea(center: Coords | null, wantKm = NEAR_RADIUS_KM): PinArea | null {
  if (!center) return null;
  if (wantKm > WORLD_RADIUS_KM) return "world";
  const radiusKm = RADII.find((r) => r >= wantKm) ?? WORLD_RADIUS_KM;
  const grid = radiusKm / 4 / 111.32;
  const snap = (v: number) => Number((Math.round(v / grid) * grid).toFixed(4));
  return { lat: snap(center.lat), lng: snap(center.lng), radiusKm };
}

/** "Following only" narrows discovery (map + AR) to followed brands. */
export function useDiscoveryPins(area: PinArea | null) {
  const { pins, isLoading, isFetching, isError, refetch } = usePinsQuery(area);
  const followingOnly = useSettings((s) => s.followingOnly);
  const { brands, isLoading: brandsLoading } = useBrandsQuery();
  const discovered = useMemo(() => {
    if (!followingOnly || brandsLoading) return pins;
    const followed = new Set(brands.filter((b) => b.followed).map((b) => b.id));
    return pins.filter((p) => followed.has(p.brandId));
  }, [pins, followingOnly, brands, brandsLoading]);
  // isFetching: any request in flight (first load, a new area, a background refresh).
  return { pins: discovered, isLoading, isFetching, isError, refetch };
}
