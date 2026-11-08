"use client";

import { Hexagon, Plus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { MapRef } from "react-map-gl/mapbox";

import { BaseMap, WORLD_VIEW } from "~/components/map-kit/base-map";
import { DrawTool } from "~/components/map-kit/draw-tool";
import {
  moveArea,
  toMapboxFeature,
  type DrawShape,
  type StoredFeature,
} from "@wadzzo/geo/map-geometry";
import { Layer, Source } from "react-map-gl/mapbox";
import { HotspotLayer } from "~/components/map-kit/hotspot-layer";
import { PinLayer } from "~/components/map-kit/pin-layer";
import { PlaceSearch } from "~/components/map-kit/place-search";
import { SearchedPlaceMarker } from "~/components/map-kit/searched-place-marker";
import { NearbyLocationsPanel } from "~/components/map/nearby-locations-panel";
import CopyCutPinModal from "~/components/modals/copy-cut-pin-modal";
import HotspotDetailModal from "~/components/modals/hotspot-details-modal";
import PinDetailAndActionsModal from "~/components/modals/pin-detail-modal";
import { Button } from "@wadzzo/ui/poster/button";
import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { AgentChat } from "~/features/agent/agent-chat";
import { AgentMapLayer } from "~/features/agent/agent-map";
import { useCopyCutModalStore } from "~/store/copy-cut-modal-store";
import { useHotspotDraft } from "~/store/hotspot-draft";
import {
  useMapInteractionStore,
  useNearbyPinsStore,
  usePinsMapViewStore,
  type PinOnMap,
} from "~/store/map-stores";
import toast from "react-hot-toast";

import { api } from "~/utils/api";

import { templateArea } from "./templates/mapping";
import { TemplatePicker, type TemplateRow } from "./templates/template-picker";

/**
 * Pins › Map (Mapbox). Your pins and hotspot areas; click the map to start a
 * pin there, draw an area to start a hotspot. Copied/cut pins paste where you
 * click. Pins in view are listed on the right (desktop).
 */
export default function MapView({ toolbarEnd }: { toolbarEnd?: ReactNode }) {
  const router = useRouter();
  const map = useRef<MapRef>(null);
  const [showExpired, setShowExpired] = useState(false);
  const search = useSearchParams();
  const [drawing, setDrawing] = useState(false);
  const [drawShape, setDrawShape] = useState<DrawShape>("polygon");

  // /pins?draw=1[&shape=circle] opens straight into drawing (from "Redraw"):
  // switch modes during render, then drop the flag from the URL.
  // `&template=<id>` (a hotspot template without an area) carries on to its form once drawn.
  const drawParam = search?.get("draw") === "1" ? (search.get("shape") ?? "") : null;
  const [seenDraw, setSeenDraw] = useState<string | null>(null);
  const [drawTemplateId, setDrawTemplateId] = useState<string | null>(null);
  if (drawParam !== seenDraw) {
    setSeenDraw(drawParam);
    if (drawParam !== null) {
      if (drawParam === "polygon" || drawParam === "rectangle" || drawParam === "circle")
        setDrawShape(drawParam);
      setDrawTemplateId(search?.get("template") ?? null);
      setDrawing(true);
    }
  }
  useEffect(() => {
    if (search?.get("draw") === "1") router.replace("/pins", { scroll: false });
  }, [search, router]);
  const [hotspotId, setHotspotId] = useState<string | null>(null);
  /** A template being placed: the next map click drops it there. */
  const [placing, setPlacing] = useState<TemplateRow | null>(null);
  const placingArea = placing?.formType === "HOTSPOT" ? templateArea(placing.data) : null;

  // Coming back from /pins/new (or anywhere) restores the camera and the
  // searched place instead of re-fitting all the pins. Read once: the view is
  // saved on every move, and subscribing would re-render the map each time.
  const [savedView] = useState(() => usePinsMapViewStore.getState().view);
  const saveView = usePinsMapViewStore((s) => s.setView);
  const place = usePinsMapViewStore((s) => s.place);
  const setPlace = usePinsMapViewStore((s) => s.setPlace);

  const { setPosition, openPinDetailModal, isPinCopied, isPinCut, setIsAutoCollect } =
    useMapInteractionStore();
  const { myPins, setMyPins, filterNearbyPins } = useNearbyPinsStore();
  const openCopyCut = useCopyCutModalStore((s) => s.setIsOpen);
  const utils = api.useUtils();
  // The map carries only what it needs to draw a pin; the whole pin is fetched when it is opened.
  const selectPin = useCallback(
    (pin: PinOnMap) => {
      const loading = toast.loading("Opening pin…");
      utils.maps.pin.getPinDetail
        .fetch({ id: pin.id })
        .then((full) => {
          openPinDetailModal(full);
          setIsAutoCollect(full.autoCollect);
        })
        .catch((e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Couldn't open that pin"),
        )
        .finally(() => toast.dismiss(loading));
    },
    [utils, openPinDetailModal, setIsAutoCollect],
  );
  const setDraft = useHotspotDraft((s) => s.set);

  const pins = api.maps.pin.getMyPins.useQuery({ showExpired });
  const hotspots = api.maps.pin.myHotspots.useQuery();

  // /pins?hotspot=<id> opens that hotspot and frames its area.
  const linkedHotspot = search?.get("hotspot");
  useEffect(() => {
    if (!linkedHotspot || !hotspots.data) return;
    const h = hotspots.data.find((x) => x.id === linkedHotspot);
    const ring =
      h &&
      toMapboxFeature(h.geoJson as Parameters<typeof toMapboxFeature>[0])?.geometry.coordinates[0];
    if (ring?.length) {
      const lngs = ring.map((p) => p[0]!);
      const lats = ring.map((p) => p[1]!);
      map.current?.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 120, maxZoom: 17, duration: 0 },
      );
    }
  }, [linkedHotspot, hotspots.data]);
  // …and opens its details once the hotspots have loaded.
  const [seenLink, setSeenLink] = useState<string | null>(null);
  if (linkedHotspot && hotspots.data && seenLink !== linkedHotspot) {
    setSeenLink(linkedHotspot);
    if (hotspots.data.some((x) => x.id === linkedHotspot)) setHotspotId(linkedHotspot);
  }
  useEffect(() => {
    if (pins.data) setMyPins(pins.data);
  }, [pins.data, setMyPins]);

  const refreshInView = useCallback(() => {
    const b = map.current?.getBounds();
    if (b)
      filterNearbyPins(
        {
          north: b.getNorth(),
          south: b.getSouth(),
          east: b.getEast(),
          west: b.getWest(),
        },
        "my",
      );
  }, [filterNearbyPins]);
  useEffect(refreshInView, [myPins, refreshInView]);

  // Start near the brand's pins, else near the browser's location.
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current || !pins.data || !hotspots.data || !map.current) return;
    centred.current = true;
    if (search?.get("hotspot")) return; // the deep link frames its own area
    if (savedView) return; // the brand was already looking somewhere
    // Every pin plus every hotspot corner.
    const points = [
      ...pins.data.map((p) => [p.longitude, p.latitude] as const),
      ...hotspots.data.flatMap(
        (h) =>
          toMapboxFeature(
            h.geoJson as Parameters<typeof toMapboxFeature>[0],
          )?.geometry.coordinates[0]?.map(([lng, lat]) => [lng!, lat!] as const) ?? [],
      ),
    ];
    if (points.length) {
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      map.current.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 80, maxZoom: 15, duration: 0 },
      );
    } else {
      navigator.geolocation?.getCurrentPosition((pos) =>
        map.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 12,
          duration: 800,
        }),
      );
    }
  }, [pins.data, hotspots.data, search, savedView]);

  const flyTo = (c: { lat: number; lng: number }, zoom = 15) =>
    map.current?.flyTo({ center: [c.lng, c.lat], zoom, duration: 700 });

  const dropTemplate = (t: TemplateRow, at: { lat: number; lng: number } | null) => {
    setPlacing(null);
    if (t.formType === "PIN") {
      router.push(
        at
          ? `/pins/new?template=${t.id}&lat=${at.lat.toFixed(6)}&lng=${at.lng.toFixed(6)}`
          : `/pins/new?template=${t.id}`,
      );
      return;
    }
    const area = templateArea(t.data);
    if (!area) return;
    // The saved area, or the same area moved so its centre is where the brand clicked.
    setDraft(at ? moveArea(area.feature, at) : area.feature, area.shape);
    router.push(`/pins/hotspots/new?template=${t.id}`);
  };

  const pickTemplate = (t: TemplateRow) => {
    if (t.formType === "HOTSPOT" && !templateArea(t.data)) {
      // No saved area: draw one, then the form opens with the template.
      setDrawTemplateId(t.id);
      setDrawing(true);
      return;
    }
    setPlacing(t);
    const area = t.formType === "HOTSPOT" ? templateArea(t.data) : null;
    const spot = t.formType === "PIN" ? t.data.location : null;
    // Show where its saved spot or area is, without losing much context.
    if (area) {
      const ring = toMapboxFeature(area.feature)?.geometry.coordinates[0];
      if (ring?.length)
        map.current?.fitBounds(
          [
            [Math.min(...ring.map((p) => p[0]!)), Math.min(...ring.map((p) => p[1]!))],
            [Math.max(...ring.map((p) => p[0]!)), Math.max(...ring.map((p) => p[1]!))],
          ],
          { padding: 120, maxZoom: 16, duration: 700 },
        );
    } else if (spot) flyTo(spot, Math.max(14, map.current?.getZoom() ?? 14));
  };

  // Esc stops placing a template.
  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlacing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing]);

  const onMapClick = (lat: number, lng: number) => {
    if (drawing) return;
    if (placing) {
      dropTemplate(placing, { lat, lng });
      return;
    }
    if (isPinCopied || isPinCut) {
      setPosition({ lat, lng });
      openCopyCut(true);
      return;
    }
    router.push(`/pins/new?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`);
  };

  const onDrawn = useCallback(
    (feature: StoredFeature, shape: DrawShape) => {
      setDraft(feature, shape);
      setDrawing(false);
      router.push(
        drawTemplateId ? `/pins/hotspots/new?template=${drawTemplateId}` : "/pins/hotspots/new",
      );
    },
    [router, setDraft, drawTemplateId],
  );

  return (
    <div className="relative size-full">
      <BaseMap
        ref={map}
        controlsPosition="bottom-left"
        locate
        initialViewState={savedView ?? WORLD_VIEW}
        onClick={(e) => {
          // A click on a hotspot area opens that hotspot (HotspotLayer handles
          // it) — it must not also start a new pin underneath.
          const m = map.current;
          if (
            !drawing &&
            !placing &&
            m?.getLayer("hotspot-fill") &&
            m.queryRenderedFeatures(e.point, { layers: ["hotspot-fill"] }).length
          )
            return;
          onMapClick(e.lngLat.lat, e.lngLat.lng);
        }}
        onMoveEnd={(e) => {
          refreshInView();
          const v = e.viewState;
          saveView({
            longitude: v.longitude,
            latitude: v.latitude,
            zoom: v.zoom,
            pitch: v.pitch,
            bearing: v.bearing,
          });
        }}
        onLoad={refreshInView}
        cursor={drawing ? "crosshair" : placing || isPinCopied || isPinCut ? "copy" : "pointer"}
      >
        {hotspots.data && (
          <HotspotLayer
            hotspots={hotspots.data}
            onSelect={drawing || placing ? undefined : setHotspotId}
          />
        )}
        {placingArea && (
          <Source
            id="template-area"
            type="geojson"
            data={
              toMapboxFeature(placingArea.feature) ?? { type: "FeatureCollection", features: [] }
            }
          >
            <Layer
              id="template-area-fill"
              type="fill"
              paint={{ "fill-color": "#22c55e", "fill-opacity": 0.12 }}
            />
            <Layer
              id="template-area-line"
              type="line"
              paint={{ "line-color": "#16a34a", "line-width": 2, "line-dasharray": [2, 1] }}
            />
          </Source>
        )}
        {!drawing && <PinLayer pins={myPins} onSelect={selectPin} />}
        {!drawing && place && (
          <SearchedPlaceMarker
            place={place}
            onClear={() => setPlace(null)}
            onDrop={(p) => router.push(`/pins/new?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}`)}
          />
        )}
        {!drawing && <AgentMapLayer />}
        {drawing && (
          <DrawTool
            initialShape={drawShape}
            onDone={onDrawn}
            onCancel={() => {
              setDrawing(false);
              setDrawTemplateId(null);
            }}
          />
        )}
      </BaseMap>

      {/* Toolbar */}
      {!drawing && !placing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
          <PlaceSearch
            className="pointer-events-auto w-full sm:w-80"
            initialQuery={place?.name}
            onSelect={(p) => {
              setPlace(p);
              flyTo(p, 14);
            }}
            onClear={() => setPlace(null)}
          />
          <div className="bg-card pointer-events-auto flex h-10 items-center gap-2 rounded-lg border px-3 shadow-sm">
            <Switch id="show-expired" checked={showExpired} onCheckedChange={setShowExpired} />
            <Label htmlFor="show-expired" className="text-xs font-medium">
              Show expired
            </Label>
          </div>
          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            {toolbarEnd}
            <TemplatePicker
              label="Templates"
              align="end"
              className="bg-card shadow-sm"
              onPick={pickTemplate}
            />
            <Button
              variant="outline"
              className="shadow-sm"
              onClick={() => {
                setDrawTemplateId(null);
                setDrawing(true);
              }}
            >
              <Hexagon /> <span className="hidden sm:inline">Draw hotspot</span>
            </Button>
            <Button
              className="hidden shadow-sm sm:inline-flex"
              onClick={() => router.push("/pins/new")}
            >
              <Plus /> New pin
            </Button>
          </div>
        </div>
      )}

      {/* Placing a template */}
      {placing && !drawing && (
        <div className="absolute inset-x-3 top-3 z-20 flex justify-center lg:top-4">
          <div className="bg-card border-foreground/10 flex w-full max-w-lg flex-wrap items-center gap-2 rounded-[1.2rem] border-2 p-3 shadow-lg">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-hud font-semibold">{placing.name}</span>
              <span className="text-muted-foreground block text-xs">
                {placing.formType === "PIN"
                  ? "Click the map to drop it there"
                  : "Click the map to move the area there (same size and shape)"}
              </span>
            </p>
            {(placing.formType === "PIN" ? placing.data.location : placingArea) && (
              <Button size="sm" onClick={() => dropTemplate(placing, null)}>
                {placing.formType === "PIN" ? "Drop at saved spot" : "Use saved area"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPlacing(null)}>
              <X /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Paste mode banner */}
      {(isPinCopied || isPinCut) && !drawing && !placing && (
        <div className="bg-primary font-hud text-primary-foreground absolute top-28 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg sm:top-20">
          Click the map to {isPinCut ? "move" : "paste"} the pin
        </div>
      )}

      {!drawing && (
        <NearbyLocationsPanel
          className="absolute top-20 right-4 z-10"
          onSelectPlace={(c) => flyTo(c)}
        />
      )}

      <PinDetailAndActionsModal />
      <CopyCutPinModal />
      <HotspotDetailModal
        isOpen={Boolean(hotspotId)}
        setIsOpen={(o: boolean) => !o && setHotspotId(null)}
        hotspotId={hotspotId}
      />
      <AgentChat />
    </div>
  );
}
