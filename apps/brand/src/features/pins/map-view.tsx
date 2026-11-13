"use client";

import { Hexagon, Plus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Marker, type MapRef } from "react-map-gl/mapbox";

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
import { TrailBuildLayers } from "~/components/map-kit/trail-build-layers";
import { TRAIL_HIT_LAYER, TrailLayer } from "~/components/map-kit/trail-layer";
import { SearchedPlaceMarker } from "~/components/map-kit/searched-place-marker";
import { NearbyLocationsPanel } from "~/components/map/nearby-locations-panel";
import CopyCutPinModal from "~/components/modals/copy-cut-pin-modal";
import HotspotDetailModal from "~/components/modals/hotspot-details-modal";
import PinDetailAndActionsModal from "~/components/modals/pin-detail-modal";
import { cn } from "@wadzzo/ui/lib/cn";
import { Button } from "@wadzzo/ui/poster/button";
import { Label } from "@wadzzo/ui/components/label";
import { Switch } from "@wadzzo/ui/components/switch";
import { AgentChat } from "~/features/agent/agent-chat";
import { AgentMapLayer } from "~/features/agent/agent-map";
import { addStop, draftPath, useTrailBuilder } from "~/features/trails/builder-store";
import { matchesTrailStyle, NewStopDialog, UseStyleDialog } from "~/features/trails/stop-dialogs";
import { LayerSwitcher } from "~/features/pins/layers/layer-switcher";
import { onSelectedLayer, useSelectedLayer } from "~/features/pins/layers/selected-layer";
import { FormCardProvider, type ActingBrand } from "~/ui/form-card";
import { TrailBuilder } from "~/features/trails/trail-builder";
import { TrailCard } from "~/features/trails/trail-card";
import {
  blankDraft,
  boundsOf,
  DRAFT_LINE_ID,
  draftLine,
  draftStops,
  lineOf,
  stopsOf,
  toDraft,
  unsavedStopPins,
  whyNotStop,
  type TrailView,
} from "~/features/trails/trail-lines";
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

import EditHotspotPage from "./edit-hotspot-page";
import EditPinPage from "./edit-pin-page";
import { useMapFormCard, type MapFormCard } from "./map-form-card";
import NewHotspotPage from "./new-hotspot-page";
import NewPinPage from "./new-pin-page";
import { templateArea } from "./templates/mapping";
import { TemplatePicker, type TemplateRow } from "./templates/template-picker";

/**
 * Pins › Map (Mapbox). Your pins and hotspot areas; click the map to start a
 * pin there, draw an area to start a hotspot (both open as a floating card, like the trail
 * builder; the full pages are still there). Copied/cut pins paste where you click. Pins in
 * view are listed on the right (desktop).
 *
 * Map layers (docs/layers): with a layer picked on the toolbar the map shows only that layer's
 * pins, hotspots and trails, and new ones are made in it. No layer is the regular map.
 */
/**
 * Frames a trail's box, keeping the stops clear of the trail card: beside it on a wide screen,
 * above it on a phone.
 */
function fitBox(m: MapRef | null, box: ReturnType<typeof boundsOf> | null | undefined) {
  if (!m || !box) return;
  m.fitBounds(box, {
    padding: window.matchMedia("(min-width: 1024px)").matches
      ? { top: 100, bottom: 80, left: 440, right: 400 }
      : { top: 120, bottom: 360, left: 40, right: 40 },
    maxZoom: 17,
    duration: 700,
  });
}

export default function MapView({
  toolbarEnd,
  toolbarStart,
  brand,
}: {
  toolbarEnd?: ReactNode;
  /** Before the search (Admin › All maps puts its brand picker here). */
  toolbarStart?: ReactNode;
  /**
   * The brand an admin is acting for (Admin › All maps): its pins, hotspots, trails and layers,
   * and everything made here is made for it. Undefined: the signed-in brand's own map.
   * Remount (key) per brand.
   */
  brand?: ActingBrand;
}) {
  const router = useRouter();
  // Where this map lives, for tidying the URL after a deep link.
  const home = brand ? `/admin/maps?brand=${encodeURIComponent(brand.id)}` : "/pins";
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
    if (search?.get("draw") === "1") router.replace(home, { scroll: false });
  }, [search, router, home]);
  const [hotspotId, setHotspotId] = useState<string | null>(null);
  /** A template being placed: the next map click drops it there. */
  const [placing, setPlacing] = useState<TemplateRow | null>(null);
  const placingArea = placing?.formType === "HOTSPOT" ? templateArea(placing.data) : null;

  // Map trails (docs/trails): the brand's trails drawn on the map; one clicked opens its card.
  // Trail mode (the builder) is open while `draft` is set: clicking pins adds them as stops,
  // clicking empty map makes a new stop there.
  // Trails are hidden for now: their lines are not drawn and Trail mode can't be opened.
  const showTrails = false;
  const [trailId, setTrailId] = useState<string | null>(null);
  const draft = useTrailBuilder((s) => s.draft);
  const trailMode = draft !== null;
  // Drawing one section of the trail by hand: map clicks add bends to it.
  const pathDrawing = useTrailBuilder((s) => s.drawing);

  const [newStopAt, setNewStopAt] = useState<{ lat: number; lng: number } | null>(null);

  // Map layers (docs/layers): the layer picked on the toolbar, or null for the regular map.
  const selectedLayer = useSelectedLayer((s) => s.id);
  // Other layers switched on with their eye, shown alongside (what's made still goes in the
  // selected one).
  const shownLayers = useSelectedLayer((s) => s.shown);
  const showLayer = useCallback(
    (layerId: string | null | undefined) => onSelectedLayer(layerId, selectedLayer, shownLayers),
    [selectedLayer, shownLayers],
  );
  // The pin or hotspot form open as a floating card, and the spot last clicked for it.
  const formCard = useMapFormCard((s) => s.card);
  const cardAt = useMapFormCard((s) => s.at);
  const [styleAsk, setStyleAsk] = useState<PinOnMap | null>(null);

  // Coming back from /pins/new (or anywhere) restores the camera and the
  // searched place instead of re-fitting all the pins. Read once: the view is
  // saved on every move, and subscribing would re-render the map each time.
  // Not for an admin acting for a brand: each brand's map opens framed on its own pins.
  const [savedView] = useState(() => (brand ? null : usePinsMapViewStore.getState().view));
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

  // The signed-in brand's own, or (an admin acting for a brand) that brand's.
  const myPinsQuery = api.maps.pin.getMyPins.useQuery({ showExpired }, { enabled: !brand });
  const brandPinsQuery = api.maps.pin.getCreatorPins.useQuery(
    { creator_id: brand?.id ?? "", showExpired },
    { enabled: Boolean(brand) },
  );
  const pins = brand ? brandPinsQuery : myPinsQuery;
  const myHotspots = api.maps.pin.myHotspots.useQuery(undefined, { enabled: !brand });
  const brandHotspots = api.maps.pin.getCreatorHotspots.useQuery(
    { creatorId: brand?.id ?? "" },
    { enabled: Boolean(brand) },
  );
  const hotspots = brand ? brandHotspots : myHotspots;
  const shownHotspots = useMemo(
    () => hotspots.data?.filter((h) => showLayer(h.layerId)),
    [hotspots.data, showLayer],
  );
  const trails = api.maps.trail.list.useQuery(brand ? { creatorId: brand.id } : undefined, {
    enabled: showTrails,
  });
  const shownTrails = (trails.data ?? []).filter(
    (t) => t.status !== "ENDED" && t.path.length > 0 && t.id !== draft?.id && showLayer(t.layerId),
  );
  const selectedTrail = trails.data?.find((t) => t.id === trailId) ?? null;
  // Trail mode: new stops not saved yet are drawn as pins too (their pins are made on save),
  // in the brand's own shapes when they use one.
  const hasNewStops = Boolean(draft?.stops.some((s) => s.newPin));
  const brandShapes = api.maps.shape.list.useQuery(
    draft?.creatorId ? { creatorId: draft.creatorId } : undefined,
    { enabled: hasNewStops, staleTime: 60_000 },
  );
  // The picked layer's pins (or the regular ones), plus the stops of the trail being built
  // wherever they are, plus its new stops not saved yet.
  const draftPins = useMemo(() => {
    const stopIds = new Set(draft?.stops.map((s) => s.pinId));
    const shown = myPins.filter(
      (p) => showLayer(p.locationGroup?.layerId) || stopIds.has(p.locationGroup?.id ?? ""),
    );
    return draft && hasNewStops
      ? [
          ...shown,
          ...unsavedStopPins(
            draft,
            myPins[0]?.locationGroup?.creator.profileUrl ?? null,
            new Map((brandShapes.data ?? []).map((sh) => [sh.id, sh])),
          ),
        ]
      : shown;
  }, [draft, hasNewStops, myPins, brandShapes.data, showLayer]);
  const applyStyle = api.maps.trail.applyStyle.useMutation({
    onError: (e) => toast.error(e.message),
  });

  // /pins?trail=new opens Trail mode on a new trail; /pins?trail=<id> on that trail.
  // In an effect (after the leave-the-map cleanup below has run on a dev remount), not in render.
  const linkedTrail = search?.get("trail") ?? null;
  const linkedBox = useRef<ReturnType<typeof boundsOf>>(null);
  useEffect(() => {
    if (!linkedTrail) return;
    if (!showTrails) {
      router.replace(home, { scroll: false });
      return;
    }
    if (linkedTrail !== "new" && !trails.data) return;
    const t = trails.data?.find((x) => x.id === linkedTrail);
    if (linkedTrail === "new")
      useTrailBuilder.getState().open(blankDraft(brand?.id, useSelectedLayer.getState().id));
    else if (t) {
      useTrailBuilder.getState().open(toDraft(t));
      // Frame it: now if the map is ready, else when it loads (see onLoad).
      const d = useTrailBuilder.getState().draft;
      const box = d && boundsOf(d.stops, draftPath(d));
      if (map.current) fitBox(map.current, box);
      else linkedBox.current = box;
    }
    router.replace(home, { scroll: false });
  }, [linkedTrail, trails.data, router, home, brand?.id, showTrails]);
  // Leaving the map leaves Trail mode and closes the form card. While the map is here, Edit in
  // the pin and hotspot details opens the card instead of the edit page.
  useEffect(() => {
    useMapFormCard.getState().setHosted(true);
    return () => {
      useTrailBuilder.getState().close();
      useMapFormCard.getState().close();
      useMapFormCard.getState().setHosted(false);
    };
  }, []);
  const actingId = brand?.id;
  // Acting for a brand: start on its regular map, without the last brand's pins, and leave
  // no other brand's layer picked behind (the layer choice is shared with the brand's own map).
  useEffect(() => {
    if (!actingId) return;
    useSelectedLayer.getState().reset();
    useNearbyPinsStore.getState().setMyPins([]);
    return () => useSelectedLayer.getState().reset();
  }, [actingId]);

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

  // Start near the brand's pins, else near the browser's location. Not when the map has
  // already been moved (by the brand, or by Trail mode fitting a trail or a GPX track) before
  // the pins arrived: on a slow connection that would yank the map away.
  const centred = useRef(false);
  const moved = useRef(false);
  useEffect(() => {
    if (centred.current || !pins.data || !hotspots.data || !map.current) return;
    centred.current = true;
    if (search?.get("hotspot")) return; // the deep link frames its own area
    if (savedView) return; // the brand was already looking somewhere
    if (moved.current || useTrailBuilder.getState().draft) return;
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

  const flyTo = (c: { lat: number; lng: number }, zoom = 15) => {
    moved.current = true;
    map.current?.flyTo({ center: [c.lng, c.lat], zoom, duration: 700 });
  };

  const fitTo = (box: ReturnType<typeof boundsOf>) => {
    if (!box) return;
    moved.current = true;
    fitBox(map.current, box);
  };
  const fitTrail = (t: TrailView) =>
    fitTo(
      boundsOf(
        t.stops.map((s) => ({ lat: s.pin.latitude, lng: s.pin.longitude })),
        t.path,
      ),
    );
  // Read from the store: it may have changed in this same event (a GPX import fits the map).
  const fitDraft = () => {
    const d = useTrailBuilder.getState().draft;
    if (!d) return;
    fitTo(boundsOf(d.stops, [...draftPath(d), ...(d.track ? [d.track] : [])]));
  };

  const editTrail = (t: TrailView) => openTrailMode(toDraft(t));
  const closeTrailMode = () => {
    useTrailBuilder.getState().close();
    setNewStopAt(null);
    setStyleAsk(null);
  };

  /** Opens Trail mode (closing any form card: the builder takes the left side). */
  const openTrailMode = (d: ReturnType<typeof blankDraft>) => {
    setTrailId(null);
    useMapFormCard.getState().close();
    useTrailBuilder.getState().open(d);
  };

  /** Trail mode: a click on one of the brand's pins makes it the next stop. */
  const pinAsStop = (pin: PinOnMap) => {
    if (!draft) return;
    // Drawing: a pin on the way is just another bend.
    if (useTrailBuilder.getState().drawing) {
      useTrailBuilder.getState().addBend([pin.longitude, pin.latitude]);
      return;
    }
    const groupId = pin.locationGroup?.id;
    const at = draft.stops.findIndex((s) => s.pinId === groupId);
    if (at >= 0) {
      toast(`Already stop ${at + 1}. Remove it from the list to take it off.`);
      return;
    }
    const why = whyNotStop(pin);
    if (why) {
      toast.error(why);
      return;
    }
    if (matchesTrailStyle(pin, draft.stopDefaults)) addPinStop(pin);
    else setStyleAsk(pin);
  };
  const addPinStop = (pin: PinOnMap) => {
    const g = pin.locationGroup!;
    useTrailBuilder.getState().change((d) =>
      addStop(d, {
        pinId: g.id,
        title: g.title,
        lat: pin.latitude,
        lng: pin.longitude,
        image: g.image,
        required: true,
        clue: null,
      }),
    );
  };

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
    if (pathDrawing) {
      useTrailBuilder.getState().addBend([lng, lat]);
      return;
    }
    if (trailMode) {
      setNewStopAt({ lat, lng });
      return;
    }
    if (placing) {
      dropTemplate(placing, { lat, lng });
      return;
    }
    if (isPinCopied || isPinCut) {
      setPosition({ lat, lng });
      openCopyCut(true);
      return;
    }
    // A pin card open: the click says where the pin goes. Otherwise a new pin here.
    const card = useMapFormCard.getState();
    if (card.card?.kind === "newPin" || card.card?.kind === "editPin") card.moveTo({ lat, lng });
    else if (!card.card) card.open({ kind: "newPin" }, { lat, lng });
  };

  const onDrawn = useCallback(
    (feature: StoredFeature, shape: DrawShape) => {
      setDraft(feature, shape);
      setDrawing(false);
      // A template carries on to its page; otherwise the hotspot form opens as a card.
      if (drawTemplateId) router.push(`/pins/hotspots/new?template=${drawTemplateId}`);
      else useMapFormCard.getState().open({ kind: "newHotspot" });
    },
    [router, setDraft, drawTemplateId],
  );

  return (
    <div className="relative size-full">
      <BaseMap
        ref={map}
        controlsPosition="bottom-left"
        locate
        forceTerrain={draft?.mode === "HIKE"}
        initialViewState={savedView ?? WORLD_VIEW}
        onClick={(e) => {
          // A click on a hotspot area opens that hotspot (HotspotLayer handles
          // it) — it must not also start a new pin underneath.
          const m = map.current;
          if (
            !drawing &&
            !placing &&
            !trailMode &&
            m?.getLayer("hotspot-fill") &&
            m.queryRenderedFeatures(e.point, { layers: ["hotspot-fill"] }).length
          )
            return;
          // Likewise a click on a trail's line opens the trail (TrailLayer handles it).
          if (
            !drawing &&
            !placing &&
            !pathDrawing &&
            m?.getLayer(TRAIL_HIT_LAYER) &&
            m.queryRenderedFeatures(e.point, { layers: [TRAIL_HIT_LAYER] }).length
          )
            return;
          onMapClick(e.lngLat.lat, e.lngLat.lng);
        }}
        onMoveStart={(e) => {
          // A drag, scroll or pinch by the brand.
          if ((e as { originalEvent?: unknown }).originalEvent) moved.current = true;
        }}
        onMoveEnd={(e) => {
          refreshInView();
          const v = e.viewState;
          // The brand's own map remembers where it was; an admin's view of a brand doesn't.
          if (!brand)
            saveView({
              longitude: v.longitude,
              latitude: v.latitude,
              zoom: v.zoom,
              pitch: v.pitch,
              bearing: v.bearing,
            });
        }}
        onLoad={() => {
          refreshInView();
          fitBox(map.current, linkedBox.current);
          linkedBox.current = null;
        }}
        cursor={
          drawing || pathDrawing
            ? "crosshair"
            : placing || isPinCopied || isPinCut
              ? "copy"
              : "pointer"
        }
      >
        {shownHotspots && (
          <HotspotLayer
            hotspots={shownHotspots}
            onSelect={drawing || placing || trailMode ? undefined : setHotspotId}
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
        {!drawing && (showTrails || trailMode) && (
          <TrailLayer
            trails={[
              ...(showTrails ? shownTrails.map(lineOf) : []),
              ...(draft ? [draftLine(draft, pathDrawing)] : []),
            ]}
            selectedId={trailMode ? DRAFT_LINE_ID : trailId}
            onSelect={placing || trailMode ? undefined : setTrailId}
          />
        )}
        {draft && !drawing && (
          <TrailBuildLayers
            track={draft.track}
            bends={pathDrawing?.points ?? null}
            color={draft.color}
          />
        )}
        {!drawing && (
          <PinLayer
            pins={draftPins}
            onSelect={trailMode ? pinAsStop : selectPin}
            stops={draft ? draftStops(draft) : selectedTrail ? stopsOf(selectedTrail) : undefined}
          />
        )}
        {/* Where the pin in the card goes (the spot last clicked). */}
        {!drawing && formCard && cardAt && (
          <Marker latitude={cardAt.lat} longitude={cardAt.lng} anchor="bottom">
            <span
              aria-hidden
              className="bg-primary border-background block size-5 rounded-full border-[3px] shadow-lg ring-2 ring-black/20"
            />
          </Marker>
        )}
        {!drawing && place && (
          <SearchedPlaceMarker
            place={place}
            onClear={() => setPlace(null)}
            onDrop={(p) =>
              useMapFormCard.getState().open({ kind: "newPin" }, { lat: p.lat, lng: p.lng })
            }
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
      {!drawing && !placing && !trailMode && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4",
            // A form card takes the left side (as the trail builder): the toolbar moves over.
            formCard && "lg:left-[calc(380px+2rem)]",
          )}
        >
          {toolbarStart}
          <PlaceSearch
            className={cn("pointer-events-auto w-full", formCard ? "sm:w-64" : "sm:w-80")}
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
            {/* With a form card open the create buttons step aside (as in Trail mode), so the
                toolbar fits on one row beside the card; the layer switcher stays. */}
            {/* Templates are the signed-in brand's own: not offered when acting for a brand. */}
            {!formCard && !brand && (
              <TemplatePicker
                label="Templates"
                align="end"
                className="bg-card shadow-sm"
                onPick={pickTemplate}
              />
            )}
            <LayerSwitcher className="bg-card shadow-sm" creatorId={brand?.id} />
            {!formCard && (
              <>
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
                  onClick={() => useMapFormCard.getState().open({ kind: "newPin" })}
                >
                  <Plus /> New pin
                </Button>
              </>
            )}
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

      {/* The selected trail */}
      {selectedTrail && !trailMode && !drawing && !placing && !formCard && (
        <div className="absolute inset-x-3 bottom-4 z-10 flex justify-center lg:inset-x-auto lg:top-20 lg:bottom-auto lg:left-4">
          <TrailCard
            trail={selectedTrail}
            onFit={() => fitTrail(selectedTrail)}
            onEdit={() => editTrail(selectedTrail)}
            onClose={() => setTrailId(null)}
          />
        </div>
      )}

      {/* Trail mode */}
      {trailMode && !drawing && (
        <>
          {pathDrawing ? (
            <DrawPathBar stop={pathDrawing.index + 1} bends={pathDrawing.points.length} />
          ) : (
            <div className="bg-primary font-hud text-primary-foreground pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg lg:block">
              Click your pins to add them as stops · click empty map for a new stop
            </div>
          )}

          <div className="absolute inset-x-3 bottom-3 z-20 flex max-h-[58%] lg:inset-x-auto lg:top-4 lg:bottom-4 lg:left-4 lg:max-h-none">
            <TrailBuilder
              onFit={fitDraft}
              onClose={closeTrailMode}
              onSaved={() => void utils.maps.trail.list.invalidate()}
            />
          </div>
        </>
      )}
      {/* A pin or hotspot form as a floating card (left, like the trail builder) */}
      {formCard && !trailMode && !drawing && (
        <>
          {(formCard.kind === "newPin" || formCard.kind === "editPin") && (
            <div className="bg-primary font-hud text-primary-foreground pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg lg:block">
              {formCard.kind === "newPin" && !cardAt
                ? "Click the map where the pin goes"
                : "Click the map to move the pin"}
            </div>
          )}
          <div className="absolute inset-x-3 bottom-3 z-20 flex max-h-[62%] lg:inset-x-auto lg:top-4 lg:bottom-4 lg:left-4 lg:max-h-none">
            <MapFormCardHost card={formCard} at={cardAt} layerId={selectedLayer} brand={brand} />
          </div>
        </>
      )}
      {draft && newStopAt && (
        <NewStopDialog
          // A fresh form for every new stop.
          key={`${newStopAt.lat},${newStopAt.lng}`}
          at={newStopAt}
          draft={draft}
          position={draft.stops.length + 1}
          onClose={() => setNewStopAt(null)}
          onCreated={(stop) => {
            setNewStopAt(null);
            useTrailBuilder.getState().change((d) => addStop(d, stop));
          }}
        />
      )}
      {draft && (
        <UseStyleDialog
          pin={styleAsk}
          position={draft.stops.length + 1}
          busy={applyStyle.isPending}
          onCancel={() => setStyleAsk(null)}
          onKeep={() => {
            if (styleAsk) addPinStop(styleAsk);
            setStyleAsk(null);
          }}
          onUse={() => {
            const pin = styleAsk;
            if (!pin?.locationGroup) return;
            applyStyle.mutate(
              {
                creatorId: draft.creatorId,
                look: draft.stopDefaults.look ?? {},
                pinIds: [pin.locationGroup.id],
              },
              {
                onSuccess: () => {
                  addPinStop(pin);
                  setStyleAsk(null);
                  void utils.maps.pin.getMyPins.invalidate();
                  void utils.maps.pin.getCreatorPins.invalidate();
                },
              },
            );
          }}
        />
      )}

      {/* Paste mode banner */}
      {(isPinCopied || isPinCut) && !drawing && !placing && (
        <div className="bg-primary font-hud text-primary-foreground absolute top-28 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg sm:top-20">
          Click the map to {isPinCut ? "move" : "paste"} the pin
        </div>
      )}

      {!drawing && !trailMode && !formCard && (
        <NearbyLocationsPanel
          className="absolute top-20 right-4 z-10"
          onSelectPlace={(c) => flyTo(c)}
          showLayer={showLayer}
        />
      )}

      <PinDetailAndActionsModal />
      <CopyCutPinModal />
      <HotspotDetailModal
        isOpen={Boolean(hotspotId)}
        setIsOpen={(o: boolean) => !o && setHotspotId(null)}
        hotspotId={hotspotId}
      />
      <AgentChat creatorId={brand?.id} />
    </div>
  );
}

/**
 * Drawing one section of a trail: click the map along the path, then Done. Bottom centre of
 * the map (above the builder panel on a phone, where it sits at the bottom). Enter keeps it,
 * Esc cancels, Backspace takes the last bend off.
 */
function DrawPathBar({ stop, bends }: { stop: number; bends: number }) {
  const { undoBend, finishDrawing, cancelDrawing } = useTrailBuilder.getState();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") cancelDrawing();
      else if (e.key === "Enter") finishDrawing();
      else if (e.key === "Backspace") {
        e.preventDefault();
        undoBend();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoBend, finishDrawing, cancelDrawing]);
  return (
    <div
      role="status"
      className="bg-primary text-primary-foreground absolute bottom-[calc(58%+1.5rem)] left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold shadow-lg lg:bottom-6"
    >
      <span className="font-hud px-1">
        Drawing stop {stop} → {stop + 1}: click along the path
        {bends ? ` · ${bends} bend${bends === 1 ? "" : "s"}` : ""}
      </span>
      <Button size="sm" variant="secondary" disabled={!bends} onClick={undoBend}>
        Undo bend
      </Button>
      <Button size="sm" variant="secondary" onClick={cancelDrawing}>
        Cancel
      </Button>
      <Button size="sm" variant="outline" onClick={finishDrawing}>
        Done
      </Button>
    </div>
  );
}

/**
 * The form card's content: the same pages as /pins/new, /pins/[id]/edit, /pins/hotspots/new and
 * /pins/hotspots/[id]/edit, in card mode (~/ui/form-card). Keyed per form, so each opens fresh.
 */
function MapFormCardHost({
  card,
  at,
  layerId,
  brand,
}: {
  card: MapFormCard;
  at: { lat: number; lng: number } | null;
  layerId: string | null;
  brand?: ActingBrand;
}) {
  const close = useMapFormCard((s) => s.close);
  // A form reads its layer once, when it opens: switching layers later doesn't move it.
  const value = useMemo(
    () => ({ onClose: close, onDone: close, at, layerId, brand }),
    [close, at, layerId, brand],
  );
  const key = card.kind + ("id" in card ? card.id : "");
  return (
    <FormCardProvider value={value}>
      {card.kind === "newPin" ? (
        <NewPinPage key={key} />
      ) : card.kind === "editPin" ? (
        <EditPinPage key={key} id={card.id} />
      ) : card.kind === "newHotspot" ? (
        <NewHotspotPage key={key} />
      ) : (
        <EditHotspotPage key={key} hotspotId={card.id} />
      )}
    </FormCardProvider>
  );
}
