import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, HelpCircle, Satellite } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapCanvas, type MapCanvasHandle } from "~/components/map/MapCanvas";
import { FilterMenu } from "~/components/map/FilterMenu";
import { MapSearch, MapSearchButton } from "~/components/map/MapSearch";
import { MapControls } from "~/components/map/MapControls";
import { MuralSheet } from "~/components/map/MuralSheet";
import { NearbyStrip } from "~/components/map/NearbyStrip";
import { PinSheet } from "~/components/map/PinSheet";
import { AppShell } from "~/components/shell/AppShell";
import { ProfileButton } from "~/components/shell/ProfileButton";
import { ArIconButton } from "~/components/ui/ArButton";
import { CollectCelebration } from "~/components/fx/CollectCelebration";
import { AR_CAPTURE_RADIUS, distanceMeters } from "~/lib/ar/geo";
import { LocationGate } from "~/components/shell/LocationGate";
import { FALLBACK_CENTER } from "~/lib/ar/mock";
import { pinStatus } from "~/lib/ar/rarity";
import { useFeedback } from "~/lib/ar/feedback";
import { useDeviceHeading } from "~/lib/ar/useDeviceHeading";
import { useAuth, useSettings } from "~/lib/ar/store";
import type { ArPin, TravelMode } from "~/lib/ar/types";
import {
  GEO_REASON_TEXT,
  useGeolocation,
  type GeoReason,
} from "~/lib/ar/useGeolocation";
import {
  filterPins,
  PIN_FILTERS,
  sortByDistance,
  useBrands,
  useCollectPin,
  useDiscoveryPinsQuery,
  type PinFilterId,
} from "~/lib/ar/usePins";
import { cn } from "~/lib/utils";
import { api } from "~/utils/api";

/**
 * ── Map ────────────────────────────────────────────────────────────────────
 *
 * The home screen. A live, pitched Mapbox view that follows you while you
 * move, the nearest drops as a thumb rail, and one welded recenter/refetch
 * control.
 *
 * Two behaviours carry the "it's alive" feeling:
 *
 *  · Follow mode. The camera eases to each new GPS fix until you drag, then
 *    hands you the wheel until you press recenter. That's what makes it work
 *    on a bike.
 *
 *  · Auto-collect. With the setting on, any pin flagged `auto_collect` that
 *    you walk inside 75 m of is claimed for you — one at a time, ~1.2 s
 *    apart, so five pins in a market row arrive as a sequence you can watch
 *    rather than one indistinguishable pile.
 */
export default function MapScreen() {
  const router = useRouter();
  const {
    fix,
    center,
    status,
    reason: geoReason,
    retry: retryLocation,
  } = useGeolocation();

  // Discovery surface: respects the viewer's "Following only" preference.
  const {
    pins,
    isLoading: pinsLoading,
    refetch: refetchPins,
  } = useDiscoveryPinsQuery();
  const brands = useBrands();
  const collectPin = useCollectPin();

  const settings = useSettings();
  const feedback = useFeedback();

  /**
   * Compass map. The hook attaches its listener only once `request()` has
   * resolved, which on iOS must happen inside a user gesture — so the request
   * is fired from the compass button in `MapControls`, not from an effect
   * here. This just reads whatever heading is live.
   *
   * `null` unless the setting is on *and* a real sensor reading has arrived:
   * `useDeviceHeading` reports `source: "manual"` until then, and feeding the
   * map its initial 0° would swing it to north-up as if that were a real
   * measurement.
   */
  const compass = useDeviceHeading();
  const headingUp =
    settings.compassMode && compass.source === "sensor" ? compass.heading : null;

  // Attach on load when the browser needs no permission (Android, desktop)
  // and the setting is already on from a previous session. Where a permission
  // *is* required this resolves to denied-without-prompt, and the button below
  // re-asks inside a real gesture.
  useEffect(() => {
    if (settings.compassMode && compass.permission === "pending") {
      void compass.request();
    }
  }, [settings.compassMode, compass]);


  const requireAuth = useAuth((s) => s.requireAuth);
  const signedIn = useAuth((s) => Boolean(s.user));

  const mapRef = useRef<MapCanvasHandle>(null);
  const [filter, setFilter] = useState<PinFilterId>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [celebrating, setCelebrating] = useState<ArPin | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * The compass button. Asking for device-orientation permission here is the
   * whole reason this lives on the map rather than in the settings list: iOS
   * only honours `requestPermission()` from inside a user gesture, so the tap
   * that switches compass mode on has to be the tap that asks.
   *
   * Switching off returns the map to north rather than abandoning it at
   * whatever heading it happened to be facing — a map left at 237° with no
   * live compass is just crooked.
   *
   * The toast is what actually confirms the tap did something. The button
   * itself only changes by a colour shift on a small glass icon — real, but
   * easy to miss glancing at a map while walking, and "on" here silently
   * depends on whether the permission prompt was even granted (denied is
   * indistinguishable from granted-but-not-turned-yet without one).
   */
  const handleToggleCompass = useCallback(() => {
    const turningOn = !settings.compassMode;
    // Turning on: back to you first, then the compass takes over.
    // Turning on: follow you again — the follow easing re-centres (once); the compass then turns the map.
    if (turningOn) setFollowing(true);
    settings.toggle("compassMode");
    if (turningOn) {
      void compass.request();
      setToast("Compass map on — turn to look around");
    } else {
      mapRef.current?.resetBearing();
      setToast("Compass map off — facing north");
    }
  }, [settings, compass]);

  /**
   * Keep the filter rail honest about the "Following only" preference.
   *
   * With that setting on, the pin set reaching this screen is *already*
   * restricted to brands you follow (see `useDiscoveryPinsQuery`). A rail
   * still offering "All" would be claiming to widen a set it cannot widen —
   * tapping it would change the label and nothing else — so the tab is
   * dropped rather than left as a control that lies about what it does, and
   * the selection moves to "Following", which is now what "everything" means.
   *
   * Available and Collected stay: those filter by *status* rather than by
   * source, so they remain meaningful within the followed set.
   */
  const filters = useMemo(
    () =>
      settings.followingOnly
        ? PIN_FILTERS.filter((f) => f.id !== "all")
        : PIN_FILTERS,
    [settings.followingOnly],
  );

  useEffect(() => {
    if (settings.followingOnly && filter === "all") setFilter("following");
  }, [settings.followingOnly, filter]);

  const followedIds = useMemo(
    () => new Set(brands.filter((b) => b.followed).map((b) => b.id)),
    [brands],
  );

  const visible = useMemo(
    () => filterPins(pins, filter, followedIds),
    [pins, filter, followedIds],
  );

  const nearby = useMemo(
    () => sortByDistance(visible, fix).slice(0, 12),
    [visible, fix],
  );

  // A drop picked from search may not be in the loaded list yet (or at all,
  // under the viewer's Following-only preference) — its sheet falls back to
  // the search result.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPin, setSearchPin] = useState<ArPin | null>(null);
  const selected = useMemo(
    () =>
      pins.find((p) => p.id === selectedId) ??
      (searchPin?.id === selectedId ? searchPin : null),
    [pins, selectedId, searchPin],
  );

  // ── Proximity feedback ─────────────────────────────────────────────────
  // A buzz/blip the first time each pin crosses into capture range. Keyed by
  // id rather than a count so pins drifting in and out at the boundary — GPS
  // jitter does this constantly — can't retrigger, and so a pin that goes out
  // of range and genuinely comes back later still announces itself once the
  // set has been rebuilt by a real move.
  const announced = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!fix) return;

    const inRange = new Set(
      pins
        .filter(
          (p) =>
            pinStatus(p) === "collectible" &&
            distanceMeters(fix, p) <= AR_CAPTURE_RADIUS,
        )
        .map((p) => p.id),
    );

    for (const id of inRange) {
      if (!announced.current.has(id)) feedback.cameIntoRange();
    }
    announced.current = inRange;
  }, [pins, fix, feedback]);

  // ── Auto-collect ───────────────────────────────────────────────────────
  // Claims one eligible pin at a time so a dense cluster plays out as a
  // sequence. `pending` guards against a second timer being armed while one
  // is already in flight.
  const pending = useRef(false);
  useEffect(() => {
    if (!settings.autoCollect || !signedIn || !fix || pending.current) return;

    const next = pins.find(
      (p) =>
        p.autoCollect &&
        pinStatus(p) === "collectible" &&
        distanceMeters(fix, p) <= AR_CAPTURE_RADIUS,
    );
    if (!next) return;

    pending.current = true;
    const id = setTimeout(() => {
      collectPin.mutate(
        { locationId: next.id, lat: fix.lat, lng: fix.lng },
        {
          onSuccess: () => {
            setToast(`Auto-collected ${next.title}`);
            feedback.captured(next.rarity);
          },
          // Quietly skipping a failure would leave auto-collect looking
          // broken; the message says whether it was range, stock or a gate.
          onError: (err) => setToast(err.message),
          onSettled: () => {
            pending.current = false;
          },
        },
      );
    }, 1_200);

    return () => {
      clearTimeout(id);
      pending.current = false;
    };
  }, [settings.autoCollect, signedIn, fix, pins, collectPin, feedback]);

  useEffect(() => {
    if (!toast) return;
    // Long enough to actually read. 2.6s suits "Pins up to date" but not a
    // four-line explanation, so scale with length and hold a floor.
    const ms = Math.min(9_000, Math.max(2_600, toast.length * 55));
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast]);

  // ── Controls ───────────────────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    setFollowing(true);
    mapRef.current?.recenter(fix ?? center ?? FALLBACK_CENTER);
  }, [fix, center]);

  const handleRefetch = useCallback(() => {
    setRefetching(true);
    void refetchPins()
      .then(() => setToast("Pins up to date"))
      .catch(() => setToast("Couldn't reach the drop server"))
      .finally(() => setRefetching(false));
  }, [refetchPins]);

  // ── Murals layer (docs/murals/plan.md §7) ────────────────────────────────
  const [muralLayer, setMuralLayer] = useState<"all" | "verified" | "off">("all");
  const [selectedMuralId, setSelectedMuralId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  // Rounded so a nudge of the map doesn't refetch; ~1 km grid.
  const muralArea = bounds && {
    north: Math.ceil(bounds.north * 100) / 100,
    south: Math.floor(bounds.south * 100) / 100,
    east: Math.ceil(bounds.east * 100) / 100,
    west: Math.floor(bounds.west * 100) / 100,
  };
  const muralsQuery = api.murals.inArea.useQuery(
    { ...(muralArea ?? { north: 0, south: 0, east: 0, west: 0 }), includeUnverified: muralLayer === "all" },
    { enabled: Boolean(muralArea) && muralLayer !== "off", keepPreviousData: true, staleTime: 60_000, refetchOnWindowFocus: false },
  );
  const murals = muralLayer === "off" ? [] : (muralsQuery.data?.murals ?? []);
  const selectedMural = murals.find((m) => m.id === selectedMuralId) ?? null;
  const cycleMuralLayer = useCallback(() => {
    const next = muralLayer === "all" ? "verified" : muralLayer === "verified" ? "off" : "all";
    setMuralLayer(next);
    setToast(next === "all" ? "Murals: all, incl. unverified" : next === "verified" ? "Murals: verified only" : "Murals hidden");
    setSelectedMuralId(null);
  }, [muralLayer]);

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setSelectedMuralId(null);
      if (!id) return;
      const pin = pins.find((p) => p.id === id);
      if (pin) mapRef.current?.flyToPin(pin);
    },
    [pins],
  );

  // "Capture in AR" opens the camera and aims at this pin — it does not
  // collect on the spot. Direct-collecting from the map sheet was what the
  // button did until now, which is a real gap between what it's labeled and
  // what it did: the whole pitch of this app is pointing your phone at the
  // world, and a button reading "Capture in AR" that skipped AR let anyone
  // farm drops without ever opening the camera.
  //
  // `?target=` is deliberately not the collection page's `?pin=` — that
  // param also puts the AR scene in single-pin mode and switches off the
  // range check, which is right for revisiting a card you already own but
  // wrong here: this pin isn't collected yet, and hiding every other nearby
  // drop from the scene would be an odd way to reward walking up to a
  // cluster of them. `target` only seeds which pin the reticle prefers once
  // you've turned toward it; you still have to aim it and press Capture.
  const handleCapture = useCallback(
    (pin: ArPin) => {
      if (!requireAuth("collect")) return;
      setSelectedId(null);
      void router.push(`/ar?target=${pin.id}`);
    },
    [requireAuth, router],
  );

  const handleDirections = useCallback(
    (pin: ArPin, mode: TravelMode) => {
      setSelectedId(null);
      void router.push(`/directions/${pin.id}?mode=${mode}`);
    },
    [router],
  );

  return (
    <AppShell>
      <div className="relative h-full w-full">
        <MapCanvas
          ref={mapRef}
          pins={visible}
          fix={fix}
          center={center ?? FALLBACK_CENTER}
          selectedId={selectedId}
          onSelect={handleSelect}
          following={following}
          onUserPan={() => setFollowing(false)}
          onCompassGesture={() => {
            // Touching the map hands rotation back to you: compass mode off (map stays where you left it).
            if (!settings.compassMode) return;
            settings.toggle("compassMode");
            setToast("Compass off — you moved the map");
          }}
          headingUp={headingUp}
          murals={murals}
          muralDailyLimit={muralsQuery.data?.dailyLimit}
          selectedMuralId={selectedMuralId}
          onSelectMural={(id) => {
            setSelectedId(null);
            setSelectedMuralId(id);
            setFollowing(false);
            const m = murals.find((x) => x.id === id);
            if (m) mapRef.current?.flyToMural(m);
          }}
          onBoundsChange={setBounds}
        />

        {/* No fix, no game: the map behind is centred on nothing meaningful,
            so the gate covers it rather than letting someone browse pins that
            aren't near them. */}
        {!fix && (
          <LocationGate
            status={status}
            reason={geoReason}
            onRetry={retryLocation}
          />
        )}

        {/* ── Top HUD ──────────────────────────────────────────────────
            GPS status and the filter chips share one row rather than the
            status pill getting a full-width strip of its own above them —
            on its own line it read as a stray badge floating in empty
            space, isolated from everything else in the HUD. The auto-collect
            "Auto" badge that used to sit opposite it is gone entirely rather
            than moved: the lightning-bolt toggle in the side rail already
            glows and pulses while it's on, so a second "Auto" label was
            confirming information the icon already gives. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-4"
          style={{ paddingTop: "calc(var(--ar-top-inset) + 14px)" }}
        >
          <GpsPill
            status={status}
            reason={geoReason}
            onExplain={setToast}
          />

          <MapSearchButton
            onClick={() => setSearchOpen(true)}
            className="pointer-events-auto"
          />

          <FilterMenu
            filters={filters}
            value={filter}
            onChange={setFilter}
            className="pointer-events-auto mr-auto"
          />

          {/* Events sits just under the avatar, centred on it. */}
          <div className="relative">
            <ProfileButton className="pointer-events-auto" />
            <ArIconButton
              icon={CalendarDays}
              label="Events"
              onClick={() => void router.push("/events")}
              className="pointer-events-auto absolute right-0 top-[calc(100%+8px)] h-9 w-9"
            />
          </div>
        </div>

        <MapControls
          onRecenter={handleRecenter}
          onRefetch={handleRefetch}
          compassMode={settings.compassMode}
          onToggleCompass={handleToggleCompass}
          refetching={refetching}
          following={following}
          autoCollect={settings.autoCollect}
          muralLayer={muralLayer}
          onCycleMuralLayer={cycleMuralLayer}
          onToggleAutoCollect={() => {
            if (!requireAuth("settings")) return;
            const turningOn = !settings.autoCollect;
            settings.toggle("autoCollect");
            setToast(
              turningOn
                ? "Auto-collect on — nearby drops claim themselves"
                : "Auto-collect off",
            );
          }}
        />

        {/* ── Nearby rail ──────────────────────────────────────────── */}
        <div className="absolute inset-x-0 bottom-0 z-30 pb-2">
          <NearbyStrip
            items={nearby}
            selectedId={selectedId}
            onSelect={handleSelect}
            loading={pinsLoading}
          />
        </div>

        {/* ── Toast ────────────────────────────────────────────────── */}
        <AnimatePresence>
          {toast && (
            <motion.div
              // Centring goes through motion's own `x`, not Tailwind's
              // `-translate-x-1/2`: motion animates `y` here, and it writes a
              // complete inline `transform` for any key it controls, which
              // silently drops the utility's translate — leaving the toast
              // sitting at `left: 50%` with nothing pulling it back by half
              // its own width, off-centre to the right.
              style={{ x: "-50%" }}
              initial={{ opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.96 }}
              // Short confirmations ("Pins up to date") keep the pill; a full
              // explanation has to wrap instead of running off both edges of
              // the phone, and reads badly as wide-tracked uppercase.
              className={cn(
                "ar-glass absolute left-1/2 top-[108px] z-40 max-w-[min(86%,23rem)] px-4 py-2",
                toast.length > 42 ? "rounded-2xl" : "rounded-full",
              )}
            >
              <p
                className={cn(
                  "font-hud text-[11px] font-semibold text-ar-green-hot",
                  toast.length > 42
                    ? "text-center leading-relaxed tracking-[0.03em]"
                    : "whitespace-nowrap uppercase tracking-[0.12em]",
                )}
              >
                {toast}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <MapSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        fix={fix}
        onPickPin={(pin) => {
          // A match the current filter hides would open a sheet with no marker.
          if (
            filterPins([pin], filter, followedIds).length === 0 &&
            !settings.followingOnly
          ) {
            setFilter("all");
          }
          setSearchPin(pin);
          setSelectedId(pin.id);
          setFollowing(false);
          mapRef.current?.flyToPin(pin);
        }}
        onPickPlace={(coords) => {
          setSelectedId(null);
          setFollowing(false);
          mapRef.current?.recenter(coords, { zoom: 15.5 });
        }}
      />

      <MuralSheet
        mural={selectedMural}
        dailyLimit={muralsQuery.data?.dailyLimit ?? 3}
        fix={fix}
        onClose={() => setSelectedMuralId(null)}
      />

      <PinSheet
        pin={selected}
        fix={fix}
        onClose={() => setSelectedId(null)}
        onCapture={handleCapture}
        onDirections={handleDirections}
      />

      <AnimatePresence>
        {celebrating && (
          <CollectCelebration
            pin={celebrating}
            onDone={() => {
              const id = celebrating.id;
              setCelebrating(null);
              void router.push(`/collection/${id}`);
            }}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}

/**
 * Says whether the puck is real. When it isn't, the pill becomes tappable and
 * explains itself — "Demo walk" on its own prompts exactly one question, and
 * the answer differs by cause: a blocked permission is fixed in the browser, a
 * missing fix is fixed in the OS.
 */
function GpsPill({
  status,
  reason,
  onExplain,
}: {
  status: string;
  reason: GeoReason | null;
  onExplain: (text: string) => void;
}) {
  const live = status === "tracking";
  const label =
    status === "tracking"
      ? "Live"
      : status === "prompting"
        ? "Locating…"
        : status === "denied"
          ? "Location off"
          : "No signal";

  const explanation = reason ? GEO_REASON_TEXT[reason] : null;

  const content = (
    <>
      <Satellite
        size={11}
        strokeWidth={2.6}
        className={live ? "text-ar-green-hot" : "text-ar-faint"}
      />
      <span
        className={`font-hud text-[9.5px] font-semibold uppercase tracking-[0.14em] ${
          live ? "text-ar-text" : "text-ar-dim"
        }`}
      >
        {label}
      </span>
      {explanation && (
        <HelpCircle size={10} strokeWidth={2.6} className="text-ar-faint" />
      )}
    </>
  );

  const className =
    "ar-glass pointer-events-auto flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5";

  if (!explanation) return <span className={className}>{content}</span>;

  return (
    <button
      type="button"
      className={className}
      title={explanation}
      aria-label={`${label}. Tap to find out why.`}
      onClick={() => onExplain(explanation)}
    >
      {content}
    </button>
  );
}
