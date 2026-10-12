import { Camera, Images, LineLayer, LocationPuck, MapView, MarkerView, ShapeSource, SymbolLayer, UserTrackingMode } from "@rnmapbox/maps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Bike,
  Bus,
  Car,
  Check,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Footprints,
  Gauge,
  LocateFixed,
  Map as MapIcon,
  Menu,
  Merge,
  Navigation,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
  Split,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Line, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";

import { DirectionsLoading } from "~/components/directions/DirectionsLoading";
import { DragSheet } from "~/components/directions/DragSheet";
import { BackButton } from "~/components/shell/ScreenHeader";
import { LocationGate } from "~/components/shell/LocationGate";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { usePinQuery } from "~/lib/api/queries";
import { distanceMeters, formatDistance } from "~/lib/ar/geo";
import { useGeolocation, useHeading } from "~/lib/ar/location";
import { formatDuration, formatNavDistance } from "~/lib/ar/navigation";
import type { TravelMode } from "~/lib/ar/types";
import { firstText, PROFILE_LABEL, useDirections, type Route, type RouteStep } from "~/lib/ar/useDirections";
import { useNavigation } from "~/lib/ar/useNavigation";
import { useMural } from "~/lib/murals/api";
import { MAP_STYLE, useColors, useResolvedTheme } from "~/theme/theme";

const MODES: { id: TravelMode; icon: LucideIcon; label: string }[] = [
  { id: "walk", icon: Footprints, label: "Walk" },
  { id: "cycle", icon: Bike, label: "Cycle" },
  { id: "transit", icon: Bus, label: "Fastest" },
  { id: "drive", icon: Car, label: "Drive" },
];
const isMode = (v: unknown): v is TravelMode => typeof v === "string" && ["walk", "cycle", "transit", "drive"].includes(v);

/** Murals are scannable from this far (matches MuralSheet). */
const MURAL_SCAN_FROM_M = 100;
/** Above this speed (m/s, ~9 km/h) follow the direction of travel; slower, the compass. */
const COURSE_SPEED = 2.5;
/** In preview, the route start snaps to this grid (~100 m) — re-plans only after a real move. */
const ORIGIN_GRID = 0.001;
const NAV_PEEK = 100;

type NavStyle = "classic" | "compass";
const STYLE_KEY = "wadzzo.navStyle";

const NAV_GREEN = "#0f5c1c";
const NAV_GREEN_DEEP = "#0a4214";
const ROUTE = "#3fd831";
const ROUTE_CASING = "#0b4614";
const width = (lo: number, mid: number, hi: number) => ["interpolate", ["exponential", 1.5], ["zoom"], 12, lo, 15.5, mid, 19, hi] as unknown as number;

const IMAGES = {
  routeChevron: require("../../../assets/images/route-chevron.png") as number,
};

function ManeuverIcon({ step, size, color, strokeWidth = 2.6 }: { step: Pick<RouteStep, "type" | "modifier"> | null; size: number; color: string; strokeWidth?: number }) {
  const p = { size, color, strokeWidth };
  if (!step) return <ArrowUp {...p} />;
  if (step.type === "arrive") return <Flag {...p} />;
  if (step.type === "roundabout" || step.type === "rotary") return <RotateCcw {...p} />;
  if (step.type === "merge") return <Merge {...p} />;
  if (step.type === "fork") return <Split {...p} />;
  const m = step.modifier ?? "";
  if (m === "uturn") return <RotateCcw {...p} />;
  if (m === "slight left") return <ArrowUpLeft {...p} />;
  if (m === "slight right") return <ArrowUpRight {...p} />;
  if (m.includes("left")) return <CornerUpLeft {...p} />;
  if (m.includes("right")) return <CornerUpRight {...p} />;
  return <ArrowUp {...p} />;
}

const line = (coordinates: [number, number][]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: coordinates.length > 1 ? coordinates : [] },
});

function ArrivalTime({ seconds }: { seconds: number }) {
  const [now] = useState(() => Date.now());
  return <>{new Date(now + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</>;
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

/** The navigating "you": Wadzzo green chevron (Classic) or white compass arrow (Compass HUD). */
function NavArrow({ hud }: { hud: boolean }) {
  return hud ? (
    <Svg width={44} height={48} viewBox="0 0 40 44">
      <Path d="M20 3 L35 39 L20 31 L5 39 Z" fill="#f4f7f5" />
      <Path d="M20 3 L20 31 L5 39 Z" fill="#c7d0cb" />
    </Svg>
  ) : (
    <Svg width={50} height={50} viewBox="0 0 46 46">
      <Circle cx={23} cy={23} r={21} fill="#3fd831" opacity={0.16} />
      <Path d="M23 7 L35 36 L23 29 L11 36 Z" fill="#3fd831" stroke="#fff" strokeWidth={2.8} strokeLinejoin="round" />
    </Svg>
  );
}

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

const DIAL = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** The HUD compass dial — static SVG; rotation applied by the parent. */
function DialFace({ size }: { size: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r - 1} fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180;
        const major = i % 6 === 0;
        const r1 = r - 4, r2 = r - (major ? 13 : 8);
        return <Line key={i} x1={r + Math.sin(a) * r1} y1={r - Math.cos(a) * r1} x2={r + Math.sin(a) * r2} y2={r - Math.cos(a) * r2} stroke={i === 0 ? "#ef4444" : "rgba(255,255,255,0.35)"} strokeWidth={major ? 2 : 1} />;
      })}
      {DIAL.map((d, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const lr = r - 30;
        const x = r + Math.sin(a) * lr, y = r - Math.cos(a) * lr;
        return (
          <SvgText key={d} x={x} y={y + 5} textAnchor="middle" fontSize={d.length === 1 ? 15 : 10.5} fontWeight="700" fill={d === "N" ? "#ff6b6b" : d.length === 1 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)"} rotation={i * 45} origin={`${x}, ${y}`}>
            {d}
          </SvgText>
        );
      })}
    </Svg>
  );
}

function HudStat({ value, unit, label, right }: { value: ReactNode; unit?: string; label: string; right?: boolean }) {
  return (
    <View style={{ alignItems: right ? "flex-end" : "flex-start" }}>
      <Text className="font-hud text-[30px] font-bold text-white" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
        {unit ? <Text className="text-[15px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{` ${unit}`}</Text> : null}
      </Text>
      <Text className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Port of wadzzoAR's /directions/[id]. Google-Maps-style preview and live
 * navigation with two looks — Classic (turn banner + draggable sheet) and
 * Compass (dark HUD with a compass dial and corner stats).
 *
 * Mobile follows you with the native map camera (`followUserLocation`): its
 * own smoothing of position and compass/course heading is buttery, unlike
 * per-update JS camera calls. A pinch only changes the follow zoom; a pan
 * releases follow and shows Re-centre.
 */
export default function DirectionsScreen() {
  const { c, rarity: rc } = useColors();
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const camera = useRef<Camera>(null);
  const params = useLocalSearchParams<{ id: string; mode?: string; kind?: string }>();
  const isMural = params.kind === "mural";
  const [mode, setMode] = useState<TravelMode>(isMode(params.mode) ? params.mode : "walk");
  const { fix, status, reason, retry } = useGeolocation();

  const { data: pin, isLoading: pinLoading } = usePinQuery(isMural ? null : (params.id ?? null));
  const muralQuery = useMural(isMural ? (params.id ?? "") : "");
  const mural = muralQuery.data?.mural;
  const target = isMural
    ? mural
      ? { lat: mural.latitude, lng: mural.longitude, title: mural.title, subtitle: mural.artist ? `by ${mural.artist}` : "Mural", imageUrl: mural.coverUrl }
      : null
    : pin
      ? { lat: pin.lat, lng: pin.lng, title: pin.title, subtitle: pin.brandName, imageUrl: pin.imageUrl }
      : null;
  const targetLoading = isMural ? muralQuery.isLoading : pinLoading;
  const ring = isMural ? c("rarity-epic") : pin ? rc(pin.rarity) : c("ar-green");

  // ── Route ──
  const [phase, setPhase] = useState<"preview" | "nav">("preview");
  const navigating = phase === "nav";
  const previewOrigin = useMemo(
    () => (fix ? { lat: Math.round(fix.lat / ORIGIN_GRID) * ORIGIN_GRID, lng: Math.round(fix.lng / ORIGIN_GRID) * ORIGIN_GRID } : null),
    [fix],
  );
  const [navOrigin, setNavOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const { routes, route, select, modeTimes, isLoading: routeLoading, error: routeError } = useDirections({
    from: navigating ? navOrigin : previewOrigin,
    to: target ? { lat: target.lat, lng: target.lng } : null,
    mode,
    token: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
  });

  // ── Voice / haptics ──
  const [muted, setMuted] = useState(false);
  const speak = useCallback((text: string) => {
    void Speech.stop();
    Speech.speak(text, { language: "en" });
  }, []);
  const buzz = useCallback(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), []);
  const onReroute = useCallback(
    (from: { lat: number; lng: number }) => {
      setNavOrigin(from);
      if (!muted) speak("Rerouting.");
    },
    [muted, speak],
  );
  const rerouting = navigating && routeLoading;
  const nav = useNavigation({ route, fix, active: navigating, muted, speak, buzz, onReroute });

  // ── Compass ──
  const { heading: compassHeading } = useHeading(Boolean(fix));
  const moving = (fix?.speed ?? 0) > COURSE_SPEED;
  /** The map's live rotation (UI thread), for the needle, dial and preview beam. */
  const mapHeading = useSharedValue(0);
  /** Which way you face — compass when slow, course when moving — eased the short way round. */
  const facingSV = useSharedValue(0);
  const [rootH, setRootH] = useState(0);

  // ── Look ──
  const [navStyle, setNavStyleState] = useState<NavStyle>("classic");
  useEffect(() => {
    void AsyncStorage.getItem(STYLE_KEY).then((v) => v === "compass" && setNavStyleState("compass"));
  }, []);
  const setNavStyle = (s: NavStyle) => {
    setNavStyleState(s);
    void AsyncStorage.setItem(STYLE_KEY, s);
  };
  const hud = navigating && navStyle === "compass";
  const [following, setFollowing] = useState(true);
  const [northUp, setNorthUp] = useState(false);
  const [menu, setMenu] = useState<null | "style" | "steps">(null);
  const [sheetIndex, setSheetIndex] = useState(0);

  const fitRoute = useCallback(
    (r: Route | null) => {
      if (!r || !fix) return;
      let w = fix.lng, e = fix.lng, s = fix.lat, n = fix.lat;
      for (const [lng, lat] of r.coordinates) {
        w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat);
      }
      camera.current?.fitBounds([e, n], [w, s], [insets.top + 80, 48, 300, 48], 900);
    },
    [fix, insets.top],
  );
  const routeId = route?.id;
  useEffect(() => {
    if (!navigating) fitRoute(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, navigating]);

  const start = () => {
    setNavOrigin(previewOrigin);
    setFollowing(true);
    setNorthUp(false);
    setSheetIndex(0);
    setMenu(null);
    setPhase("nav");
    if (!muted && target) speak(`Starting route to ${target.title}.`);
  };
  const stop = () => {
    void Speech.stop();
    setPhase("preview");
    setMenu(null);
    setFollowing(true);
    fitRoute(route);
  };
  /** Re-centre = back to you with the compass on (same as tapping the compass while it's off). */
  const recenter = () => {
    setFollowing(true);
    setNorthUp(false);
  };
  const onCompass = () => {
    if (navigating) {
      // Off → re-centre and turn with you; on → just stop rotating (north up).
      if (northUp || !following) recenter();
      else setNorthUp(true);
    } else {
      camera.current?.setCamera({ heading: 0, pitch: 0, animationDuration: 500, animationMode: "easeTo" });
    }
  };

  const needleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-mapHeading.get()}deg` }] }));
  const dialStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-mapHeading.get()}deg` }] }));
  const facing = nav ? (moving || compassHeading == null ? nav.snap.heading : compassHeading) : (compassHeading ?? 0);
  useEffect(() => {
    const cur = facingSV.get();
    facingSV.set(withTiming(cur + wrap180(facing - cur), { duration: 220 }));
  }, [facing, facingSV]);
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${facingSV.get() - mapHeading.get()}deg` }] }));
  const beamStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${(compassHeading ?? 0) - mapHeading.get()}deg` }] }), [compassHeading]);

  if (!fix) return <LocationGate status={status} reason={reason} onRetry={() => void retry()} />;
  if (!target && targetLoading) return <DirectionsLoading mural={isMural} />;
  if (!target) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ar-bg px-8">
        <Text className="font-hud text-[15px] font-bold uppercase tracking-[1.8px] text-ar-dim">{isMural ? "Mural not found" : "Pin not found"}</Text>
        <ArLinkButton href="/map" variant="primary">
          Back to the map
        </ArLinkButton>
      </View>
    );
  }

  const alts = routes.filter((r) => r.id !== route?.id);
  const fastest = routes[0];
  const progress = nav?.progress;
  const dark = theme === "dark";
  const turnText = progress ? firstText(route?.steps[progress.step]?.banner, progress.next?.instruction, target.title) : "";
  const street = progress ? firstText(route?.steps[progress.step]?.name, route?.summary) : "";
  const remainingSteps = route && progress ? route.steps.slice(progress.step + 1) : (route?.steps ?? []);
  const routeEnd = route?.coordinates[route.coordinates.length - 1];
  const connectors: [number, number][][] = [];
  if (routeEnd && distanceMeters({ lng: routeEnd[0], lat: routeEnd[1] }, target) > 6) connectors.push([routeEnd, [target.lng, target.lat]]);
  const routeStart = route?.coordinates[0];
  if (!navigating && routeStart && distanceMeters({ lng: routeStart[0], lat: routeStart[1] }, fix) > 6) connectors.push([[fix.lng, fix.lat], routeStart]);
  const kmh = fix.speed != null && fix.speed >= 0 ? Math.round(fix.speed * 3.6) : null;
  const leftMin = progress ? Math.max(1, Math.round(progress.remainingTime / 60)) : 0;
  const dialSize = Math.min(300, Math.round(winH * 0.38));
  const previewSnaps = [0, Math.round(winH * 0.5), Math.round(winH * 0.86)];
  const navSnaps = [0, Math.min(Math.round(winH * 0.62), 520)];

  const stepsList = (steps: RouteStep[]) => (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c("ar-line") }}>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c("ar-line") }}>
          <ManeuverIcon step={step} size={18} strokeWidth={2.3} color={c("ar-text-dim")} />
          <Text className="flex-1 text-[13px] text-ar-text">{step.instruction}</Text>
          {step.distance > 0 && <Text className="font-hud text-[11px] font-bold text-ar-faint">{formatNavDistance(step.distance)}</Text>}
        </View>
      ))}
    </View>
  );
  const stylePicker = (onPick?: () => void) => (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {(
        [
          { id: "classic", icon: MapIcon, title: "Classic", sub: "3D map, turn banner" },
          { id: "compass", icon: Gauge, title: "Compass", sub: "Dial, speed, time" },
        ] as const
      ).map(({ id, icon: Icon, title, sub }) => {
        const on = navStyle === id;
        return (
          <Pressable
            key={id}
            onPress={() => {
              setNavStyle(id);
              onPick?.();
            }}
            accessibilityState={{ selected: on }}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, borderColor: on ? c("ar-green", 0.6) : c("ar-line"), backgroundColor: on ? c("ar-green", 0.12) : c("ar-text", 0.03) }}
          >
            <Icon size={20} strokeWidth={2.2} color={on ? c("ar-green-hot") : c("ar-text-dim")} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-hud text-[13px] font-bold" style={{ color: on ? c("ar-green-hot") : c("ar-text") }}>
                {title}
              </Text>
              <Text className="text-[11px] text-ar-faint" numberOfLines={1}>
                {sub}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View className="flex-1 bg-ar-bg" onLayout={(e) => setRootH(e.nativeEvent.layout.height)}>
      {navigating && <KeepAwake />}
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={MAP_STYLE[theme]}
        logoEnabled={false}
        scaleBarEnabled={false}
        compassEnabled={false}
        attributionEnabled={false}
        
        onCameraChanged={(s) => {
          mapHeading.set(s.properties.heading);
          // Any touch (pan, pinch, rotate) takes the wheel: compass off + stop following.
          // Re-centre or the compass button brings both back.
          if (navigating && s.gestures.isGestureActive && (following || !northUp)) {
            setNorthUp(true);
            setFollowing(false);
          }
        }}
      >
        <Camera
          ref={camera}
          defaultSettings={{ centerCoordinate: [fix.lng, fix.lat], zoomLevel: 15, pitch: 45 }}
          followUserLocation={navigating && following}
          followUserMode={northUp ? UserTrackingMode.Follow : moving ? UserTrackingMode.FollowWithCourse : UserTrackingMode.FollowWithHeading}
          followZoomLevel={hud ? 17.2 : 17.6}
          followPitch={hud ? 0 : 60}
          followPadding={hud ? { paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } : { paddingTop: insets.top + 190, paddingBottom: NAV_PEEK + 40, paddingLeft: 0, paddingRight: 0 }}
          onUserTrackingModeChange={(e) => {
            if (navigating && !e.nativeEvent.payload.followUserLocation) setFollowing(false);
          }}
        />
        <Images images={IMAGES} />
        {navigating && (
          // Invisible: keeps native location running for the follow camera; we draw our own arrow.
          <LocationPuck visible={false} puckBearingEnabled puckBearing={moving ? "course" : "heading"} />
        )}

        {/* Alternatives, walked, connectors, route — always mounted in this order. */}
        <ShapeSource
          id="alts"
          shape={{ type: "FeatureCollection", features: navigating ? [] : alts.map((r) => ({ ...line(r.coordinates), properties: { rid: r.id } })) }}
          onPress={(e) => {
            const rid = e.features[0]?.properties?.rid as string | undefined;
            if (rid && !navigating) select(rid);
          }}
        >
          <LineLayer id="alt-casing" style={{ lineColor: dark ? "#0b1410" : "#7d9688", lineWidth: width(4, 9, 18), lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
          <LineLayer id="alt-line" style={{ lineColor: dark ? "#55705f" : "#c3d3c9", lineWidth: width(2.5, 6, 13), lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
        </ShapeSource>
        <ShapeSource id="done" shape={line(navigating && nav ? nav.done : [])}>
          <LineLayer id="done-line" style={{ lineColor: dark ? "#5d6e65" : "#9fb0a6", lineWidth: width(3, 6.5, 14), lineOpacity: 0.8, lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
        </ShapeSource>
        <ShapeSource id="connect" shape={{ type: "FeatureCollection", features: connectors.map(line) }}>
          <LineLayer id="connect-dots" style={{ lineColor: ROUTE, lineWidth: width(2.5, 4.5, 8), lineDasharray: [0, 2], lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
        </ShapeSource>
        <ShapeSource id="route" shape={line(!route ? [] : navigating && nav ? nav.ahead : route.coordinates)}>
          <LineLayer id="route-glow" style={{ lineColor: ROUTE, lineWidth: width(8, 18, 34), lineOpacity: 0.22, lineBlur: 6, lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
          <LineLayer id="route-casing" style={{ lineColor: ROUTE_CASING, lineWidth: width(5, 11, 22), lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
          <LineLayer id="route-line" style={{ lineColor: ROUTE, lineWidth: width(3, 7, 15), lineCap: "round", lineJoin: "round", lineEmissiveStrength: 1 }} />
          <SymbolLayer
            id="route-chevrons"
            minZoomLevel={14.5}
            style={{
              symbolPlacement: "line",
              symbolSpacing: 64,
              iconImage: "routeChevron",
              iconSize: ["interpolate", ["linear"], ["zoom"], 14.5, 0.35, 17, 0.6, 19, 1] as unknown as number,
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
              iconRotationAlignment: "map",
              iconPitchAlignment: "map",
              iconOpacity: 0.85,
              iconEmissiveStrength: 1,
            }}
          />
        </ShapeSource>

        {/* Time bubbles (preview). */}
        {!navigating &&
          alts.map((r) => {
            const mid = r.coordinates[Math.floor(r.coordinates.length / 2)];
            if (!mid) return null;
            const diff = Math.round((r.duration - (route?.duration ?? r.duration)) / 60);
            return (
              <MarkerView key={r.id} coordinate={mid} anchor={{ x: 0.5, y: 1 }} allowOverlap>
                <Pressable onPress={() => select(r.id)} style={{ borderRadius: 10, borderWidth: 1, borderColor: c("ar-line"), backgroundColor: c("ar-surface"), paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text className="font-hud text-[11px] font-bold text-ar-dim">
                    {formatDuration(r.duration)}
                    {diff !== 0 ? ` ${diff > 0 ? "+" : ""}${diff}` : ""}
                  </Text>
                </Pressable>
              </MarkerView>
            );
          })}
        {!navigating && route && route.coordinates.length > 2 && (
          <MarkerView coordinate={route.coordinates[Math.floor(route.coordinates.length * 0.45)]!} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: ROUTE_CASING, backgroundColor: ROUTE, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text className="font-hud text-[11.5px] font-bold" style={{ color: "#04250a" }}>
                {formatDuration(route.duration)}
              </Text>
            </View>
          </MarkerView>
        )}

        {/* Next manoeuvre (classic). */}
        {navigating && !hud && progress?.next && (
          <MarkerView coordinate={progress.next.location} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: "#fff", backgroundColor: NAV_GREEN, alignItems: "center", justifyContent: "center" }}>
              <ManeuverIcon step={progress.next} size={15} strokeWidth={3} color="#fff" />
            </View>
          </MarkerView>
        )}

        {/* Destination. */}
        <MarkerView coordinate={[target.lng, target.lat]} anchor={{ x: 0.5, y: 1 }} allowOverlap>
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 3, borderColor: ring, overflow: "hidden", backgroundColor: c("ar-surface") }}>
              <Image source={{ uri: target.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            </View>
            <View style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: ring }} />
          </View>
        </MarkerView>

        {/* You (navigating, map panned away): arrow pinned to your GPS position. */}
        {navigating && !following && (
          <MarkerView coordinate={[fix.lng, fix.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap isSelected>
            <Animated.View style={arrowStyle}>
              <NavArrow hud={hud} />
            </Animated.View>
          </MarkerView>
        )}

        {/* You (preview): dot + compass beam. */}
        {!navigating && (
          <MarkerView coordinate={[fix.lng, fix.lat]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap isSelected>
            <View style={{ width: 54, height: 54, alignItems: "center", justifyContent: "center" }}>
              {compassHeading != null && (
                <Animated.View style={[{ position: "absolute", inset: 0 }, beamStyle]}>
                  <Svg width={54} height={54} viewBox="0 0 54 54">
                    <Defs>
                      <RadialGradient id="beam" cx="50%" cy="100%" r="100%">
                        <Stop offset="0" stopColor={ROUTE} stopOpacity={0.55} />
                        <Stop offset="1" stopColor={ROUTE} stopOpacity={0} />
                      </RadialGradient>
                    </Defs>
                    <Path d="M27 27 L13 2 A28 28 0 0 1 41 2 Z" fill="url(#beam)" />
                  </Svg>
                </Animated.View>
              )}
              <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: "#fff", backgroundColor: ROUTE }} />
            </View>
          </MarkerView>
        )}
      </MapView>

      {/* HUD: darken the map, dial around you (you're at the centre in this look). */}
      {hud && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={winW} height={winH}>
            <Defs>
              <RadialGradient id="hudshade" cx="50%" cy="50%" r="75%">
                <Stop offset="0" stopColor="#040806" stopOpacity={0.12} />
                <Stop offset="0.55" stopColor="#040806" stopOpacity={0.5} />
                <Stop offset="1" stopColor="#040806" stopOpacity={0.85} />
              </RadialGradient>
            </Defs>
            <Rect width={winW} height={winH} fill="url(#hudshade)" />
          </Svg>
          {following && (
            <Animated.View style={[{ position: "absolute", left: (winW - dialSize) / 2, top: (winH - dialSize) / 2, width: dialSize, height: dialSize }, dialStyle]}>
              <DialFace size={dialSize} />
            </Animated.View>
          )}
        </View>
      )}

      {/* You (navigating, following): fixed where the follow camera keeps you — no per-fix hops. */}
      {navigating && following && rootH > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", left: winW / 2 - 25, width: 50, height: 50, alignItems: "center", justifyContent: "center" },
            { top: (hud ? rootH / 2 : insets.top + 190 + (rootH - (insets.top + 190) - (NAV_PEEK + 40)) / 2) - 25 },
            arrowStyle,
          ]}
        >
          <NavArrow hud={hud} />
        </Animated.View>
      )}

      {/* ── Classic: turn banner ── */}
      {navigating && !hud && progress && !nav?.arrived && (
        <View style={{ position: "absolute", left: 12, right: 12, top: insets.top + 8 }}>
          <View style={{ borderRadius: 20, backgroundColor: NAV_GREEN, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
            <ManeuverIcon step={progress.next} size={40} color="#fff" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-hud text-[26px] font-bold text-white" style={{ fontVariant: ["tabular-nums"] }}>
                {formatNavDistance(progress.toNext)}
              </Text>
              <Text className="mt-0.5 text-[15px] font-semibold text-white" numberOfLines={1}>
                {turnText}
              </Text>
            </View>
          </View>
          {progress.then && progress.nextToThen < 150 && (
            <View style={{ marginTop: 6, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, backgroundColor: NAV_GREEN_DEEP, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text className="text-[12.5px] font-semibold text-white">Then</Text>
              <ManeuverIcon step={progress.then} size={16} color="#fff" />
            </View>
          )}
        </View>
      )}

      {/* ── Compass HUD ── */}
      {navigating && hud && progress && !nav?.arrived && (
        <>
          <View pointerEvents="none" style={{ position: "absolute", left: 20, right: 20, top: insets.top + 12, flexDirection: "row", justifyContent: "space-between" }}>
            <HudStat value={kmh ?? "—"} unit="km/h" label="Speed" />
            <HudStat value={leftMin < 60 ? leftMin : `${Math.floor(leftMin / 60)}:${String(leftMin % 60).padStart(2, "0")}`} unit={leftMin < 60 ? "min" : "h"} label="Time left" right />
          </View>
          <View style={{ position: "absolute", left: 10, right: 10, top: insets.top + 92, flexDirection: "row", justifyContent: "space-between" }}>
            <Pressable onPress={() => setMenu("steps")} accessibilityLabel="Route and options" hitSlop={8} style={hudBtn}>
              <Menu size={24} strokeWidth={1.8} color="rgba(255,255,255,0.85)" />
            </Pressable>
            <Pressable onPress={() => setMenu("style")} accessibilityLabel="Navigation style" hitSlop={8} style={hudBtn}>
              <SlidersHorizontal size={24} strokeWidth={1.8} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
          <View pointerEvents="none" style={{ position: "absolute", top: winH / 2 - 98, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.8)", paddingHorizontal: 16, paddingVertical: 8 }}>
            <ManeuverIcon step={progress.next} size={18} strokeWidth={2.8} color="#fff" />
            <Text className="font-hud text-[16px] font-bold text-white" style={{ fontVariant: ["tabular-nums"] }}>
              {formatNavDistance(progress.toNext)}
            </Text>
          </View>
          <Text pointerEvents="none" numberOfLines={1} className="text-center text-[15px] font-medium" style={{ position: "absolute", top: winH / 2 + 40, left: "15%", right: "15%", color: "rgba(255,255,255,0.9)" }}>
            {street || turnText}
          </Text>
          <View pointerEvents="none" style={{ position: "absolute", left: 20, right: 20, bottom: insets.bottom + 96, flexDirection: "row", justifyContent: "space-between" }}>
            <HudStat value={progress.remaining >= 1000 ? (progress.remaining / 1000).toFixed(1) : Math.round(progress.remaining / 10) * 10} unit={progress.remaining >= 1000 ? "km" : "m"} label="Distance" />
            <HudStat value={<ArrivalTime seconds={progress.remainingTime} />} label="Arrive" right />
          </View>
          <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 22, flexDirection: "row", justifyContent: "center", gap: 12 }}>
            <Pressable onPress={stop} accessibilityLabel="End navigation" style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, backgroundColor: "#ef4444", paddingHorizontal: 20 }}>
              <X size={18} strokeWidth={2.8} color="#fff" />
              <Text className="font-hud text-[12px] font-bold uppercase tracking-[1.4px] text-white">End</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMuted((m) => !m);
                void Speech.stop();
              }}
              accessibilityLabel={muted ? "Unmute voice" : "Mute voice"}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}
            >
              {muted ? <VolumeX size={20} strokeWidth={2.4} color="#fff" /> : <Volume2 size={20} strokeWidth={2.4} color="#fff" />}
            </Pressable>
          </View>
        </>
      )}

      {rerouting && (
        <View style={{ position: "absolute", top: insets.top + 132, alignSelf: "center", borderRadius: 999, backgroundColor: c("ar-surface"), paddingHorizontal: 14, paddingVertical: 6 }}>
          <Text className="font-hud text-[11px] font-bold uppercase tracking-[1.4px] text-ar-green-hot">Rerouting…</Text>
        </View>
      )}

      {/* ── Map buttons: compass + locate ── */}
      {!nav?.arrived && (
        <View style={{ position: "absolute", right: 12, top: navigating ? insets.top + (hud ? 150 : 128) : insets.top + 12, gap: 10 }}>
          <Pressable onPress={onCompass} accessibilityLabel={navigating ? (northUp ? "Face your direction" : "North up") : "Reset north"} style={[mapBtn, { backgroundColor: c("ar-surface") }]}>
            <Animated.View style={needleStyle}>
              <Svg width={28} height={28} viewBox="0 0 28 28">
                <Path d="M14 2 L18.5 14 L14 12.2 L9.5 14 Z" fill="#ef4444" />
                <Path d="M14 26 L9.5 14 L14 15.8 L18.5 14 Z" fill={c("ar-text")} opacity={0.55} />
              </Svg>
            </Animated.View>
            {navigating && northUp && <View style={{ position: "absolute", right: 2, bottom: 2, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: c("ar-bg"), backgroundColor: c("ar-green-hot") }} />}
          </Pressable>
          {!navigating && (
            <Pressable onPress={() => camera.current?.setCamera({ centerCoordinate: [fix.lng, fix.lat], zoomLevel: 16.5, animationDuration: 700, animationMode: "easeTo" })} accessibilityLabel="Show my location" style={[mapBtn, { backgroundColor: c("ar-surface") }]}>
              <LocateFixed size={19} strokeWidth={2.3} color={c("ar-text")} />
            </Pressable>
          )}
        </View>
      )}

      {/* Re-centre after a pan. */}
      {navigating && !following && !nav?.arrived && (
        <Pressable
          onPress={recenter}
          style={{ position: "absolute", bottom: hud ? insets.bottom + 170 : NAV_PEEK + insets.bottom + 16, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, backgroundColor: c("ar-surface"), paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <LocateFixed size={16} strokeWidth={2.4} color={c("ar-green-hot")} />
          <Text className="font-hud text-[11px] font-bold uppercase tracking-[1.4px] text-ar-text">Re-centre</Text>
        </Pressable>
      )}

      {!navigating && (
        <View style={{ position: "absolute", left: 16, top: insets.top + 12 }}>
          <BackButton />
        </View>
      )}

      {/* ── Classic navigation: draggable sheet ── */}
      {navigating && !hud && progress && !nav?.arrived && (
        <DragSheet
          snaps={navSnaps}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          header={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12 }}>
              <Pressable onPress={stop} accessibilityLabel="End navigation" style={[round, { backgroundColor: c("ar-danger", 0.15) }]}>
                <X size={22} strokeWidth={2.6} color={c("ar-danger")} />
              </Pressable>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text className="font-hud text-[24px] font-bold text-ar-green-hot">{formatDuration(progress.remainingTime)}</Text>
                <Text className="mt-0.5 text-[12.5px] text-ar-dim">
                  {formatNavDistance(progress.remaining)} · <ArrivalTime seconds={progress.remainingTime} />
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setMuted((m) => !m);
                  void Speech.stop();
                }}
                accessibilityLabel={muted ? "Unmute voice" : "Mute voice"}
                style={[round, { backgroundColor: c("ar-text", 0.06) }]}
              >
                {muted ? <VolumeX size={20} strokeWidth={2.4} color={c("ar-text")} /> : <Volume2 size={20} strokeWidth={2.4} color={c("ar-text")} />}
              </Pressable>
            </View>
          }
        >
          {stylePicker()}
          <Text className="font-hud mb-2 mt-4 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">Next turns</Text>
          {stepsList(remainingSteps)}
        </DragSheet>
      )}

      {/* HUD menus. */}
      <Modal visible={hud && menu != null} transparent animationType="slide" onRequestClose={() => setMenu(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setMenu(null)}>
          <Pressable onPress={() => undefined} style={{ maxHeight: "75%", borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: c("ar-bg"), paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
            {menu === "style" ? (
              <>
                <Text className="font-hud mb-3 text-[12px] font-bold uppercase tracking-[1.8px] text-ar-dim">Navigation style</Text>
                {stylePicker(() => setMenu(null))}
              </>
            ) : (
              <>
                <Text className="font-hud text-[16px] font-bold text-ar-text">{target.title}</Text>
                <Text className="mb-3 text-[12.5px] text-ar-dim">{progress ? `${formatDuration(progress.remainingTime)} · ${formatNavDistance(progress.remaining)}` : ""}</Text>
                {stepsList(remainingSteps)}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Arrived ── */}
      {navigating && nav?.arrived && (
        <View style={[sheetBase, { borderColor: c("ar-line"), backgroundColor: c("ar-bg"), paddingBottom: insets.bottom + 16 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[round, { backgroundColor: c("ar-green", 0.2) }]}>
              <Check size={26} strokeWidth={3} color={c("ar-green-hot")} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="font-hud text-[19px] font-bold text-ar-text">You&apos;ve arrived</Text>
              <Text className="text-[13px] text-ar-dim" numberOfLines={1}>
                {target.title}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 16, gap: 8 }}>
            <ArButton
              variant="primary"
              size="lg"
              block
              icon={isMural ? ScanLine : Navigation}
              onPress={() => router.push(isMural ? { pathname: "/murals", params: { target: params.id } } : { pathname: "/ar", params: { target: params.id } })}
            >
              {isMural ? "Scan this mural" : "Open AR to collect"}
            </ArButton>
            <ArButton variant="ghost" size="md" block onPress={() => router.replace("/map")}>
              Done
            </ArButton>
          </View>
        </View>
      )}

      {/* ── Preview: draggable sheet ── */}
      {!navigating && (
        <DragSheet
          snaps={previewSnaps}
          index={sheetIndex}
          onIndexChange={setSheetIndex}
          header={
            <View style={{ paddingBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 2, borderColor: ring, borderStyle: isMural && mural?.status !== "APPROVED" ? "dashed" : "solid", overflow: "hidden" }}>
                  <Image source={{ uri: target.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text className="font-hud text-[16px] font-bold text-ar-text" numberOfLines={1}>
                    {target.title}
                  </Text>
                  <Text className="text-[12px] text-ar-faint" numberOfLines={1}>
                    {target.subtitle} · {formatDistance(distanceMeters(fix, target))} away
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 12, flexDirection: "row", gap: 6 }}>
                {MODES.map(({ id: m, icon: Icon, label }) => {
                  const active = mode === m;
                  const t = modeTimes[m];
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMode(m)}
                      accessibilityState={{ selected: active }}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 999, borderWidth: 1, paddingVertical: 8, borderColor: active ? "transparent" : c("ar-line"), backgroundColor: active ? NAV_GREEN : c("ar-text", 0.03) }}
                    >
                      <Icon size={15} strokeWidth={2.2} color={active ? "#fff" : c("ar-text-dim")} />
                      <Text className="font-hud text-[11.5px] font-bold" style={{ color: active ? "#fff" : c("ar-text-dim"), fontVariant: ["tabular-nums"] }}>
                        {t != null ? formatDuration(t) : routeLoading ? "…" : label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  {routeLoading && !route ? (
                    <>
                      <Skeleton className="h-6 w-32 rounded-full" />
                      <Skeleton className="mt-2 h-3 w-44 rounded-full" />
                    </>
                  ) : route ? (
                    <>
                      <Text className="font-hud text-[24px] font-bold text-ar-green-hot">
                        {formatDuration(route.duration)} <Text className="text-[15px] font-medium text-ar-dim">({formatNavDistance(route.distance)})</Text>
                      </Text>
                      <Text className="mt-1 text-[12px] text-ar-dim" numberOfLines={1}>
                        {route.id === fastest?.id ? "Fastest route" : `${Math.round((route.duration - (fastest?.duration ?? 0)) / 60)} min slower`}
                        {route.summary ? ` · via ${route.summary}` : ""}
                        {mode === "transit" ? ` · ${PROFILE_LABEL[route.profile]}` : ""}
                      </Text>
                    </>
                  ) : routeError ? (
                    <Text className="text-[12px] text-ar-danger">{routeError}</Text>
                  ) : null}
                </View>
                <ArButton variant="primary" size="lg" icon={Navigation} disabled={!route} onPress={start}>
                  Start
                </ArButton>
              </View>
            </View>
          }
        >
          {routes.length > 1 && (
            <Text className="mb-2 text-[11.5px] text-ar-faint">
              {routes.length - 1} other route{routes.length > 2 ? "s" : ""} — tap a grey line on the map to switch
            </Text>
          )}
          <Text className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">Navigation style</Text>
          {stylePicker()}
          {route && (
            <>
              <Text className="font-hud mb-2 mt-4 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">Steps</Text>
              {stepsList(route.steps)}
            </>
          )}
          <Text className="mt-3 px-1 text-[11px] leading-5 text-ar-faint">
            {isMural ? `Get within ${MURAL_SCAN_FROM_M} m and scan it with the Murals camera to earn Wadzzo Coins.` : "Get close and this drop becomes collectible in AR."}
          </Text>
        </DragSheet>
      )}
    </View>
  );
}

const mapBtn = { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" } as const;
const hudBtn = { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" } as const;
const round = { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" } as const;
const sheetBase = { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 16 } as const;
