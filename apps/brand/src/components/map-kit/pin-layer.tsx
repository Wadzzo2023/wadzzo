"use client";

import { PinType } from "@wadzzo/db";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useMap } from "react-map-gl/mapbox";

import { PointIndex, type ViewBounds } from "@wadzzo/geo/point-cluster";

import type { PinOnMap } from "~/store/map-stores";
import { getPinIcon, pinLookOf } from "~/utils/map-helpers";
import { ClusterMarker, PinMarker, pinStateOf } from "./pin-marker";

/** From this zoom up each pin is drawn whole (shape, image, count); below it, a small mark. */
export const FULL_PIN_ZOOM = 14;
/** Pins closer than this many screen pixels are grouped, until `CLUSTER_MAX_ZOOM`. */
const CLUSTER_RADIUS = 64;
const CLUSTER_MAX_ZOOM = 16;
/** Images shown in a cluster's billboard. */
const IMAGES_PER_CLUSTER = 4;
/**
 * The most different images drawn across all billboards at once. The same image on many
 * pins (a brand logo) is one image to the browser; hundreds of different photos would
 * each be decoded and held in memory, so past this budget a billboard shows a plain tile.
 */
const MAX_DISTINCT_IMAGES = 96;
/** The most marks on the map at once (a safety net; clustering keeps it far below this). */
const MAX_MARKS = 600;

type View = { bounds: ViewBounds; zoom: number; now: number };

/** A small image for a pin (the pin's own, or its brand's logo). */
const imageOf = (pin: PinOnMap) =>
  pin.locationGroup?.optimizedImage ??
  pin.locationGroup?.image ??
  pin.locationGroup?.creator.profileUrl ??
  null;

/** One pin on the map, drawn the way its brand chose. */
const PinMark = memo(function PinMark({
  pin,
  mode,
  now,
  onSelect,
}: {
  pin: PinOnMap;
  mode: "full" | "dot";
  /** The time to judge "expired" by (ms), so every mark agrees and none reads the clock itself. */
  now: number;
  onSelect: (pin: PinOnMap) => void;
}) {
  const g = pin.locationGroup;
  const look = useMemo(() => pinLookOf(pin), [pin]);
  return (
    <PinMarker
      lat={pin.latitude}
      lng={pin.longitude}
      image={g?.image ?? g?.creator.profileUrl}
      icon={getPinIcon(g?.type ?? PinType.OTHER)}
      look={look}
      count={pin._count.consumers}
      label={g?.title ?? "Pin"}
      mode={mode}
      state={pinStateOf(pin, now)}
      onClick={() => onSelect(pin)}
    />
  );
});

/**
 * Every pin on a brand map, built to stay fast and readable with thousands of them:
 * only the pins in view are drawn; pins that would overlap are grouped into one
 * numbered mark (click to zoom in); and zoomed out each pin is a small mark of its
 * own shape, turning into the whole pin as you zoom in.
 *
 * Put it inside the map. Pins are indexed once per list, so moving the map only
 * re-reads what is in view.
 */
export function PinLayer({
  pins,
  onSelect,
}: {
  pins: PinOnMap[];
  onSelect: (pin: PinOnMap) => void;
}) {
  const { current: map } = useMap();
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    const m = map?.getMap();
    if (!m) return;
    const read = () => {
      const b = m.getBounds();
      if (!b) return;
      setView({
        bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
        zoom: m.getZoom(),
        // To the minute: marks only re-draw for the clock once a minute, not on every move.
        now: Math.floor(Date.now() / 60_000) * 60_000,
      });
    };
    read();
    m.on("moveend", read);
    return () => void m.off("moveend", read);
  }, [map]);

  const index = useMemo(
    () =>
      new PointIndex(
        pins,
        (p) => ({ lat: p.latitude, lng: p.longitude }),
        (p) => p.id,
      ),
    [pins],
  );

  const marks = useMemo(() => {
    if (!view) return [];
    const found = index.query(view.bounds, view.zoom, {
      radius: CLUSTER_RADIUS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      sample: { size: IMAGES_PER_CLUSTER, by: imageOf },
    });
    if (found.length <= MAX_MARKS) return found;
    // Far too many to draw: keep the ones nearest the middle of the view.
    const lat = (view.bounds.north + view.bounds.south) / 2;
    const lng = (view.bounds.east + view.bounds.west) / 2;
    const away = (m: { lat: number; lng: number }) => (m.lat - lat) ** 2 + (m.lng - lng) ** 2;
    return found.sort((a, b) => away(a) - away(b)).slice(0, MAX_MARKS);
  }, [index, view]);

  // Which images each billboard shows, within the budget of different images on screen.
  const billboards = useMemo(() => {
    const used = new Set<string>();
    const byKey = new Map<string, string[]>();
    const biggestFirst = marks
      .filter((m) => m.type === "cluster")
      .sort((a, b) => b.count - a.count);
    for (const c of biggestFirst) {
      const images: string[] = [];
      for (const pin of c.sample) {
        const src = imageOf(pin);
        if (!src) continue;
        if (used.has(src) || used.size < MAX_DISTINCT_IMAGES) {
          used.add(src);
          images.push(src);
        }
      }
      byKey.set(c.key, images);
    }
    return byKey;
  }, [marks]);

  const zoomInto = useCallback(
    (b: ViewBounds, lat: number, lng: number) => {
      const m = map?.getMap();
      if (!m) return;
      const spread = Math.max(b.east - b.west, b.north - b.south);
      // Points on top of each other can't be framed: just zoom in on them.
      if (spread < 1e-5) m.easeTo({ center: [lng, lat], zoom: Math.min(m.getZoom() + 3, 19) });
      else
        m.fitBounds(
          [
            [b.west, b.south],
            [b.east, b.north],
          ],
          { padding: 90, maxZoom: 18, duration: 600 },
        );
    },
    [map],
  );

  const mode = view && view.zoom >= FULL_PIN_ZOOM ? "full" : "dot";
  return (
    <>
      {marks.map((m) =>
        m.type === "cluster" ? (
          <ClusterMarker
            key={m.key}
            lat={m.lat}
            lng={m.lng}
            count={m.count}
            images={billboards.get(m.key) ?? []}
            onClick={() => zoomInto(m.bounds, m.lat, m.lng)}
          />
        ) : (
          <PinMark key={m.key} pin={m.item} mode={mode} now={view?.now ?? 0} onSelect={onSelect} />
        ),
      )}
    </>
  );
}
