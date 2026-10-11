import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { distanceMeters, formatDistance } from "~/lib/ar/geo";
import type { ArPin, Coords, GeoFix } from "~/lib/ar/types";
import { api } from "~/utils/api";

const MAX_PINS = 8;
const MAX_PLACES = 5;
const DEBOUNCE_MS = 300;
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

type Place = { id: string; name: string; address: string; coords: Coords };

/** The map's search trigger: a glass circle beside the filter chip. */
export function MapSearchButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label="Search drops and places"
      className={`ar-glass flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ar-dim hover:text-ar-text ${className ?? ""}`}
    >
      <Search size={16} strokeWidth={2.4} />
    </button>
  );
}

/**
 * ── MapSearch ──────────────────────────────────────────────────────────────
 *
 * Same as the mobile app's: one box, two kinds of answer.
 *  - Drops: `pins.search` on the server — every live drop, not only what's
 *    loaded — matched on title / brand / description / tags, best match first.
 *  - Places: Mapbox forward geocoding, biased to where you are.
 * Picking a drop selects it (fly-to + sheet); picking a place moves the map.
 */
export function MapSearch({
  open,
  onClose,
  fix,
  onPickPin,
  onPickPlace,
  brandId,
}: {
  open: boolean;
  onClose: () => void;
  fix: GeoFix | null;
  onPickPin: (pin: ArPin) => void;
  onPickPlace: (coords: Coords) => void;
  /** Only this brand's drops (a website embed set to "only my brand"). */
  brandId?: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();

  // Where you are only picks which point of a multi-point drop comes back
  // (and biases places); it's captured with each debounced query so a moving
  // GPS fix doesn't refire the search.
  const near = useRef(fix);
  useEffect(() => {
    near.current = fix;
  }, [fix]);
  const [term, setTerm] = useState<{ q: string; near: GeoFix | null }>({ q: "", near: null });
  useEffect(() => {
    const id = setTimeout(() => setTerm({ q, near: near.current }), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q]);
  const debounced = term.q;

  const search = api.pins.search.useQuery(
    { q: debounced, lat: term.near?.lat, lng: term.near?.lng, limit: 12, brandId },
    { enabled: open && debounced.length >= 2, keepPreviousData: true, staleTime: 30_000 },
  );
  const pinsOn = open && q.length >= 2;
  const pinsLoading = pinsOn && (search.isFetching || debounced !== q);
  const pinHits = useMemo(
    () =>
      pinsOn && search.data
        ? search.data.slice(0, MAX_PINS).map((p) => ({ pin: p, distance: fix ? distanceMeters(fix, p) : null }))
        : [],
    [pinsOn, search.data, fix],
  );

  // Places: debounced; a newer query cancels the older request.
  const [placeResults, setPlaces] = useState<Place[]>([]);
  const [placesBusy, setPlacesBusy] = useState(false);
  useEffect(() => {
    if (!open || debounced.length < 3) return;
    const ctrl = new AbortController();
    setPlacesBusy(true);
    searchPlaces(debounced, term.near, ctrl.signal)
      .then((found) => !ctrl.signal.aborted && setPlaces(found))
      .catch(() => undefined)
      .finally(() => !ctrl.signal.aborted && setPlacesBusy(false));
    return () => ctrl.abort();
  }, [debounced, term.near, open]);
  const placesOn = open && q.length >= 3;
  const places = placesOn ? placeResults : [];
  const placesLoading = placesOn && (placesBusy || debounced !== q);

  const close = () => {
    setQuery("");
    onClose();
  };

  const nothing = q.length >= 2 && !pinsLoading && !placesLoading && pinHits.length === 0 && places.length === 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onKeyDown={(e) => e.key === "Escape" && close()}
        >
          <button aria-label="Close search" onClick={close} className="absolute inset-0 bg-ar-void/55" />

          <motion.div
            className="relative px-3"
            style={{ paddingTop: "calc(var(--ar-top-inset) + 12px)" }}
            initial={{ y: -16 }}
            animate={{ y: 0 }}
            exit={{ y: -16 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            <div className="ar-glass flex h-12 items-center gap-2.5 rounded-full border-ar-green/45 pl-4 pr-1.5">
              <Search size={17} strokeWidth={2.4} className="shrink-0 text-ar-green-hot" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search drops, brands or places"
                aria-label="Search"
                enterKeyHint="search"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ar-text outline-hidden placeholder:text-ar-faint"
              />
              <button
                onClick={query ? () => setQuery("") : close}
                aria-label={query ? "Clear search" : "Close search"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ar-dim hover:text-ar-text"
              >
                <X size={17} strokeWidth={2.4} />
              </button>
            </div>

            {q.length >= 2 && (
              <div className="ar-glass ar-scroll mt-2 max-h-[440px] rounded-[20px] py-1.5">
                {(pinHits.length > 0 || pinsLoading) && <SectionLabel loading={pinsLoading}>Drops</SectionLabel>}
                {pinHits.map(({ pin, distance }) => (
                  <Row
                    key={pin.id}
                    onClick={() => {
                      close();
                      onPickPin(pin);
                    }}
                    leading={
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={pin.brandImageUrl} alt="" className="h-[34px] w-[34px] rounded-[10px] object-cover" />
                    }
                    title={pin.title}
                    subtitle={pin.brandName}
                    trailing={distance != null ? formatDistance(distance) : undefined}
                  />
                ))}

                {(places.length > 0 || placesLoading) && <SectionLabel loading={placesLoading}>Places</SectionLabel>}
                {places.map((p) => (
                  <Row
                    key={p.id}
                    onClick={() => {
                      close();
                      onPickPlace(p.coords);
                    }}
                    leading={
                      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-ar-line bg-white/[0.04] text-ar-dim">
                        <MapPin size={16} strokeWidth={2.2} />
                      </span>
                    }
                    title={p.name}
                    subtitle={p.address}
                    trailing={fix ? formatDistance(distanceMeters(fix, p.coords)) : undefined}
                  />
                ))}

                {nothing && (
                  <div className="px-6 py-6 text-center">
                    <p className="font-hud text-[11px] font-semibold uppercase tracking-[0.16em] text-ar-dim">No matches</p>
                    <p className="mt-1 text-[12px] text-ar-faint">Try a brand name, a drop title, or a street or area.</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SectionLabel({ children, loading }: { children: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1 pt-2.5">
      <span className="font-hud text-[9.5px] font-semibold uppercase tracking-[0.22em] text-ar-faint">{children}</span>
      {loading && <Loader2 size={11} className="animate-spin text-ar-faint" />}
    </div>
  );
}

function Row({
  onClick,
  leading,
  title,
  subtitle,
  trailing,
}: {
  onClick: () => void;
  leading: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: string;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ar-green/[0.08]">
      {leading}
      <span className="min-w-0 flex-1">
        <span className="font-hud block truncate text-[13px] font-bold text-ar-text">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[11.5px] text-ar-faint">{subtitle}</span>}
      </span>
      {trailing && <span className="font-hud shrink-0 text-[10.5px] font-bold tabular-nums text-ar-dim">{trailing}</span>}
    </button>
  );
}

/** Mapbox Geocoding v6 forward search, biased toward the viewer. */
async function searchPlaces(q: string, near: GeoFix | null, signal: AbortSignal): Promise<Place[]> {
  if (!MAPBOX_TOKEN) return [];
  const params = new URLSearchParams({ q, access_token: MAPBOX_TOKEN, limit: String(MAX_PLACES), autocomplete: "true" });
  if (near) params.set("proximity", `${near.lng},${near.lat}`);
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    features?: {
      id: string;
      properties: {
        name?: string;
        full_address?: string;
        place_formatted?: string;
        coordinates?: { latitude: number; longitude: number };
      };
    }[];
  };
  return (json.features ?? []).flatMap((f) => {
    const co = f.properties.coordinates;
    if (!co || !f.properties.name) return [];
    return [
      {
        id: f.id,
        name: f.properties.name,
        address: f.properties.place_formatted ?? f.properties.full_address ?? "",
        coords: { lat: co.latitude, lng: co.longitude },
      },
    ];
  });
}
