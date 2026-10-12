import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { CalendarDays, MapPinOff } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MapCanvas, type MapCanvasHandle } from "~/components/map/MapCanvas";
import { FilterMenu } from "~/components/map/FilterMenu";
import { MapControls } from "~/components/map/MapControls";
import { MapSearch, MapSearchButton } from "~/components/map/MapSearch";
import { GpsPill, MapToast } from "~/components/map/MapHud";
import { NearbyStrip } from "~/components/map/NearbyStrip";
import { MuralSheet } from "~/components/map/MuralSheet";
import { PinSheet } from "~/components/map/PinSheet";
import { metersPerPixel } from "~/components/map/UserPuck";
import { LocationGate } from "~/components/shell/LocationGate";
import { ProfileButton } from "~/components/shell/ProfileButton";
import { useTabBarHeight } from "~/components/shell/BottomTabBar";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { ArIconButton } from "~/components/ui/ArButton";
import { useBrandsQuery, useCollectPin } from "~/lib/api/queries";
import { useFeedback, useSettings } from "~/lib/ar/feedback";
import { AR_CAPTURE_RADIUS, distanceMeters } from "~/lib/ar/geo";
import { warmArTextures } from "~/lib/ar/arTexture";
import { FALLBACK_CENTER, useGeolocation, useHeading } from "~/lib/ar/location";
import { filterPins, NEAR_RADIUS_KM, PIN_FILTERS, pinArea, sortByDistance, useDiscoveryPins, type PinFilterId } from "~/lib/ar/pins";
import { pinStatus } from "~/lib/ar/rarity";
import type { ArPin, Coords, TravelMode } from "~/lib/ar/types";
import { useSession } from "~/lib/auth/session";
import { useMuralsInArea } from "~/lib/murals/api";
import { useColors } from "~/theme/theme";

/**
 * ── /map ───────────────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's map screen: full-bleed map, GPS pill + filter chips +
 * avatar across the top, the control rail on the right, the nearby rail at
 * the bottom, and the pin sheet. Auto-collect claims in-range pins while the
 * app is open (foreground only, decided); a blip + haptic marks each pin
 * coming into range.
 */
/** `value` while `live`; otherwise the last value seen while it was. */
function useHeldWhileBlurred<T>(value: T, live: boolean): T {
  const [held, setHeld] = useState(value);
  if (live && held !== value) setHeld(value);
  return live ? value : held;
}

/** How long the map must stay still before a new area of pins is loaded. */
const VIEWPORT_SETTLE_MS = 400;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { c } = useColors();
  const tabBarHeight = useTabBarHeight();
  // While another tab is showing, hold the last fix: this screen stays
  // mounted, and re-rendering every pin on each GPS tick nobody sees is
  // what used to make the tabs lag (they aren't frozen any more).
  const isFocused = useIsFocused();
  const geo = useGeolocation();
  const fix = useHeldWhileBlurred(geo.fix, isFocused);
  const { status, reason, precise, retry } = geo;

  // ── Which pins to load ──
  // Nearby first: until the camera has settled, load the small circle
  // around you (fast, and what you'll look at first). After that, load
  // around wherever the map is looking, wide enough to cover the screen at
  // that zoom — pan to another country and its pins load; zoom out far
  // enough and it switches to every pin in the world (clustered).
  const { width: winW, height: winH } = useWindowDimensions();
  const [viewport, setViewport] = useState<{ center: Coords; zoom: number } | null>(null);
  // Settle first: zooming out pinch after pinch reports "idle" after each
  // one. Waiting VIEWPORT_SETTLE_MS for the camera to stay put turns a burst
  // of zooms into one request (and any request already running for an
  // older area is cancelled — see usePinsQuery).
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewportIdle = useCallback((center: Coords, zoom: number) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setViewport({ center, zoom }), VIEWPORT_SETTLE_MS);
  }, []);
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);
  const areaCenter = viewport?.center ?? fix;
  const areaKm = viewport ? ((Math.hypot(winW, winH) / 2) * metersPerPixel(viewport.center.lat, viewport.zoom) * 1.2) / 1000 : NEAR_RADIUS_KM;
  const area = pinArea(areaCenter, Math.max(NEAR_RADIUS_KM, areaKm));
  const { pins, isLoading, isFetching, refetch } = useDiscoveryPins(area);
  // Get AR's small coin/card images resized + cached server-side now, so
  // opening AR doesn't wait on (or stall decoding) full-size originals.
  useEffect(() => {
    if (!fix || pins.length === 0) return;
    const capturable = pins.filter((p) => !p.locked && !p.collected);
    const nearest = [...capturable].sort((a, b) => distanceMeters(fix, a) - distanceMeters(fix, b)).slice(0, 25);
    warmArTextures(nearest);
  }, [pins, fix]);
  const { brands } = useBrandsQuery();
  const collectPin = useCollectPin();
  const settings = useSettings();
  const feedback = useFeedback();
  // Only once location is allowed — iOS rejects the heading watch before
  // that — and only while this tab is showing (the sensor stops otherwise).
  const { heading } = useHeading(status === "tracking" && isFocused);
  const headingUp = settings.compassMode ? heading : null;
  const requireAuth = useSession((s) => s.requireAuth);
  const signedIn = useSession((s) => Boolean(s.user));

  const mapRef = useRef<MapCanvasHandle>(null);
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [filter, setFilter] = useState<PinFilterId>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hudHeight, setHudHeight] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  const filters = useMemo(() => (settings.followingOnly ? PIN_FILTERS.filter((f) => f.id !== "all") : PIN_FILTERS), [settings.followingOnly]);
  useEffect(() => {
    if (settings.followingOnly && filter === "all") setFilter("following");
  }, [settings.followingOnly, filter]);

  const followedIds = useMemo(() => new Set(brands.filter((b) => b.followed).map((b) => b.id)), [brands]);
  const visible = useMemo(() => filterPins(pins, filter, followedIds), [pins, filter, followedIds]);
  const nearby = useMemo(() => sortByDistance(visible, fix).slice(0, 12), [visible, fix]);
  // A drop picked from search may be outside the loaded area until the map
  // settles there and fetches it — show its sheet from the search result
  // meanwhile, then from the live list once it arrives.
  const [searchPin, setSearchPin] = useState<ArPin | null>(null);

  // ── Murals layer (wadzzoAR docs/murals/plan.md §7) ───────────────────────
  const [muralLayer, setMuralLayer] = useState<"all" | "verified" | "off">("all");
  const [selectedMuralId, setSelectedMuralId] = useState<string | null>(null);
  const [muralBounds, setMuralBounds] = useState<{ n: number; s: number; e: number; w: number } | null>(null);
  // ~1 km grid so small pans reuse the cached area.
  const muralArea = useMemo(
    () =>
      muralBounds && {
        n: Math.ceil(muralBounds.n * 100) / 100,
        s: Math.floor(muralBounds.s * 100) / 100,
        e: Math.ceil(muralBounds.e * 100) / 100,
        w: Math.floor(muralBounds.w * 100) / 100,
      },
    [muralBounds],
  );
  const muralsQuery = useMuralsInArea(muralArea, muralLayer === "all", muralLayer !== "off");
  const murals = useMemo(() => (muralLayer === "off" ? [] : (muralsQuery.data?.murals ?? [])), [muralLayer, muralsQuery.data]);
  const selectedMural = murals.find((m) => m.id === selectedMuralId) ?? null;
  const selected = useMemo(
    () => pins.find((p) => p.id === selectedId) ?? (searchPin?.id === selectedId ? searchPin : null),
    [pins, selectedId, searchPin],
  );

  // Blip + haptic the first time each collectible pin comes into range.
  const announced = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!fix) return;
    const inRange = new Set(pins.filter((p) => pinStatus(p) === "collectible" && distanceMeters(fix, p) <= AR_CAPTURE_RADIUS).map((p) => p.id));
    for (const id of inRange) if (!announced.current.has(id)) feedback.cameIntoRange();
    announced.current = inRange;
  }, [pins, fix, feedback]);

  // Auto-collect (foreground): one claim at a time, after a short settle.
  const pending = useRef(false);
  useEffect(() => {
    if (!settings.autoCollect || !signedIn || !fix || pending.current) return;
    const next = pins.find((p) => p.autoCollect && pinStatus(p) === "collectible" && distanceMeters(fix, p) <= AR_CAPTURE_RADIUS);
    if (!next) return;
    pending.current = true;
    const id = setTimeout(() => {
      collectPin.mutate(
        { id: next.id, lat: fix.lat, lng: fix.lng },
        {
          onSuccess: () => {
            setToast(`Auto-collected ${next.title}`);
            feedback.captured(next.rarity);
          },
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

  // `/map?focus=<id>` (from a card's "On the map"): open that pin once loaded.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focused.current === focus) return;
    const pin = pins.find((p) => p.id === focus);
    if (!pin) return;
    focused.current = focus;
    setFollowing(false);
    setSelectedId(pin.id);
    mapRef.current?.flyToPin(pin);
  }, [focus, pins]);

  const handleRecenter = useCallback(() => {
    setFollowing(true);
    mapRef.current?.recenter(fix ?? FALLBACK_CENTER);
  }, [fix]);

  const handleRefetch = useCallback(() => {
    setRefetching(true);
    void refetch()
      .then((r) => setToast(r.isError ? "Couldn't reach the drop server" : "Pins up to date"))
      .finally(() => setRefetching(false));
  }, [refetch]);

  // Stable across pin refetches (reads the latest list from a ref): every
  // memoized marker takes this as a prop, so a new function each refetch
  // re-rendered all of them.
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedMuralId(null);
    if (!id) return;
    const pin = pinsRef.current.find((p) => p.id === id);
    if (pin) {
      setFollowing(false);
      mapRef.current?.flyToPin(pin);
    }
  }, []);

  // Same feel as a pin: select, stop following, ease the camera onto it.
  const muralsRef = useRef(murals);
  useEffect(() => {
    muralsRef.current = murals;
  }, [murals]);
  const handleSelectMural = useCallback((id: string) => {
    setSelectedId(null);
    setSelectedMuralId(id);
    setFollowing(false);
    const m = muralsRef.current.find((x) => x.id === id);
    if (m) mapRef.current?.flyToMural(m);
  }, []);

  const handleCapture = useCallback(
    (pin: ArPin) => {
      const go = () => router.push({ pathname: "/ar", params: { target: pin.id } });
      setSelectedId(null);
      if (!requireAuth("collect", go)) return;
      go();
    },
    [requireAuth],
  );

  // Stable, so the memoized PinSheet doesn't re-render on every heading tick.
  const closeSheet = useCallback(() => setSelectedId(null), []);

  const handleDirections = useCallback((pin: ArPin, mode: TravelMode) => {
    setSelectedId(null);
    router.push({ pathname: "/directions/[id]", params: { id: pin.id, mode } });
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <MapCanvas
        ref={mapRef}
        pins={visible}
        fix={fix}
        center={fix ?? FALLBACK_CENTER}
        selectedId={selectedId}
        onSelect={handleSelect}
        following={following}
        onUserPan={() => setFollowing(false)}
        onRefollow={() => setFollowing(true)}
        onCompassGesture={() => {
          // Touching the map hands rotation back to you: compass mode off (map stays where you left it).
          if (!settings.compassMode) return;
          settings.toggle("compassMode");
          setToast("Compass off — you moved the map");
        }}
        headingUp={headingUp}
        onViewportIdle={onViewportIdle}
        heading={heading}
        murals={murals}
        muralDailyLimit={muralsQuery.data?.dailyLimit}
        selectedMuralId={selectedMuralId}
        onSelectMural={handleSelectMural}
        onBoundsIdle={setMuralBounds}
      />

      {!fix && <LocationGate status={status} reason={reason} onRetry={() => void retry()} />}

      {/* Android "Approximate" location: the map works, collecting doesn't. */}
      {fix && !precise && (
        <Pressable
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Approximate location is on. Open Settings to turn on precise location."
          style={{ position: "absolute", top: insets.top + hudHeight + 10, alignSelf: "center", zIndex: 30 }}
        >
          <Glass style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8, borderColor: c("rarity-legendary", 0.5) }}>
            <MapPinOff size={14} strokeWidth={2.4} color={c("rarity-legendary")} />
            <Text className="text-[12px] text-ar-text">
              Approximate location — <Text className="font-bold" style={{ color: c("rarity-legendary") }}>turn on Precise</Text> to collect
            </Text>
          </Glass>
        </Pressable>
      )}

      <View
        pointerEvents="box-none"
        onLayout={(e) => setHudHeight(e.nativeEvent.layout.height)}
        style={{ position: "absolute", left: 0, right: 0, top: 0, paddingTop: insets.top + 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, zIndex: 30 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <FilterMenu filters={filters} value={filter} onChange={setFilter} />
          <MapSearchButton onPress={() => setSearchOpen(true)} />
        </View>
        {/* Live status and profile share one capsule, top-right. */}
        <Glass style={{ borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 2, paddingLeft: 6, paddingRight: 3, paddingVertical: 3 }}>
          <GpsPill bare status={status} reason={reason} onExplain={setToast} />
          <ProfileButton />
        </Glass>
      </View>

      {/* Events, centred under the avatar (capsule's 3pt inset + 36pt avatar). */}
      {hudHeight > 0 && (
        <View pointerEvents="box-none" style={{ position: "absolute", top: hudHeight + 8, right: 19, zIndex: 30 }}>
          <ArIconButton icon={CalendarDays} label="Events" size={36} onPress={() => router.push("/events")} />
        </View>
      )}

      {fix && (
        <MapControls
          onRecenter={handleRecenter}
          onRefetch={handleRefetch}
          compassMode={settings.compassMode}
          onToggleCompass={() => {
            const turningOn = !settings.compassMode;
            // Turning on: follow you again — the native compass-follow camera
            // re-centres in one move (an extra recenter() made it jump twice).
            if (turningOn) setFollowing(true);
            settings.toggle("compassMode");
            if (!turningOn) mapRef.current?.resetBearing();
            setToast(turningOn ? "Compass map on — turn to look around" : "Compass map off — facing north");
          }}
          // Spins for ANY pin request, not only a tap: first load, a new area
          // after panning/zooming, and background refreshes.
          refetching={refetching || isFetching}
          following={following}
          muralLayer={muralLayer}
          onCycleMuralLayer={() => {
            const next = muralLayer === "all" ? "verified" : muralLayer === "verified" ? "off" : "all";
            setMuralLayer(next);
            setSelectedMuralId(null);
            setToast(next === "all" ? "Murals: all, incl. unverified" : next === "verified" ? "Murals: verified only" : "Murals hidden");
          }}
          autoCollect={settings.autoCollect}
          onToggleAutoCollect={() => {
            const toggle = () => {
              const on = !useSettings.getState().autoCollect;
              useSettings.getState().toggle("autoCollect");
              setToast(on ? "Auto-collect on — nearby drops claim themselves" : "Auto-collect off");
            };
            if (!requireAuth("settings", toggle)) return;
            toggle();
          }}
        />
      )}

      {fix && (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: tabBarHeight + 36, zIndex: 30 }}>
          <NearbyStrip items={nearby} selectedId={selectedId} onSelect={handleSelect} loading={isLoading} />
        </View>
      )}

      <MapToast text={toast} onDone={() => setToast(null)} top={insets.top + 64} />

      <MapSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        fix={fix}
        onPickPin={(pin) => {
          // A match the current filter hides would open a sheet with no marker.
          if (filterPins([pin], filter, followedIds).length === 0 && !settings.followingOnly) setFilter("all");
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

      <MuralSheet mural={selectedMural} dailyLimit={muralsQuery.data?.dailyLimit ?? 3} fix={fix} onClose={() => setSelectedMuralId(null)} />
      <PinSheet pin={selected} fix={fix} onClose={closeSheet} onCapture={handleCapture} onDirections={handleDirections} />
    </View>
  );
}
