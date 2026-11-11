import { Camera, LocationPuck, MapView } from "@rnmapbox/maps";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Footprints, Gift, Lock, Maximize2, MapPinned, Play, Share2, Trophy, Users } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, Share, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { DragSheet } from "~/components/directions/DragSheet";
import { BackButton, ScreenHeader } from "~/components/shell/ScreenHeader";
import { TrailMapLine } from "~/components/trails/TrailMapLine";
import { TrailShape } from "~/components/trails/TrailShape";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { SERVER_URL } from "~/lib/api/client";
import { useClaimTrailReward, useStartTrail, useTrailQuery } from "~/lib/api/queries";
import type { ArTrail } from "~/lib/api/types";
import { distanceLabel, MODE_VERB, nextStop, trailColor, useFollowTrail } from "~/lib/ar/trails";
import { useSession } from "~/lib/auth/session";
import { mapStyleFor, useColors, useMapMode, useResolvedTheme } from "~/theme/theme";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
/** About the sheet header's height: the map frames the trail above it. */
const PEEK = 250;

/**
 * ── /trails/[id] ───────────────────────────────────────────────────────────
 *
 * Port of the web app's trail page, map first: the route fills the screen (pan it,
 * tap a stop), with the details in a sheet you drag up, like directions. The
 * sheet's header holds the one thing to do next: Start, Continue on the map, or
 * Claim the reward. Stops are collected the usual way; on an ordered trail each
 * required stop waits for the one before.
 */
export default function TrailScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const requireAuth = useSession((s) => s.requireAuth);
  const follow = useFollowTrail((s) => s.follow);
  const followingId = useFollowTrail((s) => s.trailId);
  const detail = useTrailQuery(id);
  const start = useStartTrail();
  const claim = useClaimTrailReward();
  const [error, setError] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState<string | null>(null);
  // Opens at its header (the map stays in view); drag up for the reward, About and stops.
  const [sheet, setSheet] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const camera = useRef<Camera>(null);
  const theme = useResolvedTheme();
  const { mode: mapMode } = useMapMode();

  const t = detail.data;
  if (!t) {
    return (
      <View className="flex-1 bg-ar-bg">
        <ScreenHeader back eyebrow="Trail" title={detail.isLoading ? "Loading…" : "Not found"} />
        <View className="gap-3 px-5">
          {detail.isLoading ? (
            <>
              <Skeleton className="h-[280px] w-full rounded-ar-lg" />
              <Skeleton className="h-14 w-full rounded-ar-lg" />
            </>
          ) : (
            <>
              <Text className="text-[13px] text-ar-dim">This trail has ended or isn&rsquo;t available.</Text>
              <ArLinkButton href="/trails" variant="primary">
                All trails
              </ArLinkButton>
            </>
          )}
        </View>
      </View>
    );
  }

  const color = trailColor(t);
  const { done, total, complete, requiredTotal } = t.progress;
  const next = nextStop(t);
  const onTrail = followingId === t.id;
  const canClaim = Boolean(complete && t.reward && !t.reward.claimed && t.reward.remaining > 0);
  const snaps = [0, Math.round(height * 0.86)]; // 0 = fit the header
  const sheetH = sheet === 0 ? PEEK : (snaps[1] ?? PEEK);

  const goToMap = () => {
    follow(t.id);
    router.navigate("/map");
  };
  const onStart = () => {
    if (!requireAuth("collect")) return;
    setError(null);
    if (t.run) return goToMap();
    start.mutate(t.id, { onSuccess: goToMap, onError: (e) => setError(e.message) });
  };
  const onClaim = () => {
    setError(null);
    claim.mutate(t.id, {
      onSuccess: (r) => {
        setRedeemCode(r.redeemCode);
        void detail.refetch();
      },
      onError: (e) => setError(e.message),
    });
  };

  const fitAll = (bottom: number) => {
    const b = t.bounds;
    camera.current?.fitBounds([b.maxLng, b.maxLat], [b.minLng, b.minLat], [insets.top + 70, 44, bottom + 36, 44], 700);
  };
  const focusStop = (position: number, fromMap = false) => {
    const s = t.stops.find((x) => x.position === position);
    if (!s) return;
    setFocused(position);
    // From the list the sheet drops to its header; from the map it stays as it is.
    if (!fromMap && sheet === 1) setSheet(0);
    const below = !fromMap || sheet === 0 ? PEEK : sheetH;
    camera.current?.setCamera({
      centerCoordinate: [s.lng, s.lat],
      zoomLevel: 15.5,
      padding: { paddingTop: insets.top + 60, paddingBottom: below, paddingLeft: 0, paddingRight: 0 },
      animationDuration: 600,
      animationMode: "easeTo",
    });
  };

  const primary = complete ? (
    canClaim ? (
      <ArButton block size="lg" variant="primary" icon={Trophy} busy={claim.isPending} onPress={onClaim}>
        Claim your reward
      </ArButton>
    ) : (
      <View className="h-12 flex-row items-center justify-center rounded-ar border" style={{ gap: 8, borderColor: c("ar-green", 0.4), backgroundColor: c("ar-green", 0.1) }}>
        <Check size={16} strokeWidth={3} color={c("ar-green-hot")} />
        <Text className="font-hud text-[12px] font-bold uppercase tracking-[1.4px]" style={{ color: c("ar-green-hot") }}>
          Trail complete
        </Text>
      </View>
    )
  ) : (
    <ArButton block size="lg" variant="primary" icon={t.run ? MapPinned : Play} busy={start.isPending} onPress={onStart}>
      {t.run ? (onTrail ? "Back to the map" : "Continue on the map") : "Start trail"}
    </ArButton>
  );

  const b = t.bounds;
  return (
    <View className="flex-1 bg-ar-bg">
      {/* ── Map ─────────────────────────────────────────────────────── */}
      {MAPBOX_TOKEN ? (
        <MapView
          style={StyleSheet.absoluteFill}
          styleURL={mapStyleFor(mapMode, theme)}
          logoEnabled={false}
          scaleBarEnabled={false}
          compassEnabled={false}
          attributionEnabled={false}
          onPress={() => setFocused(null)}
        >
          <Camera
            ref={camera}
            defaultSettings={{
              bounds: { ne: [b.maxLng, b.maxLat], sw: [b.minLng, b.minLat], paddingTop: insets.top + 70, paddingBottom: PEEK + 36, paddingLeft: 44, paddingRight: 44 },
            }}
            maxZoomLevel={18}
          />
          <TrailMapLine trail={t} onStop={(p) => focusStop(p, true)} />
          <LocationPuck pulsing={{ isEnabled: true }} />
        </MapView>
      ) : (
        <View style={{ height: "55%", alignItems: "center", justifyContent: "center" }}>
          <Grid />
          <TrailShape trail={t} size={260} numbers />
        </View>
      )}

      {/* ── Over the map: back, share, whole trail ──────────────────── */}
      <View className="absolute left-4" style={{ top: insets.top + 12 }}>
        <BackButton fallback="/map" className="h-10 w-10" />
      </View>
      <View className="absolute right-4" style={{ top: insets.top + 12, gap: 8 }}>
        <MapButton label="Share this trail" onPress={() => void Share.share({ title: t.title, message: `${t.title}\n${SERVER_URL}/trails/${encodeURIComponent(t.id)}` })}>
          <Share2 size={15} strokeWidth={2.2} color={c("ar-text")} />
        </MapButton>
        <MapButton
          label="Show the whole trail"
          onPress={() => {
            setFocused(null);
            fitAll(sheetH);
          }}
        >
          <Maximize2 size={15} strokeWidth={2.2} color={c("ar-text")} />
        </MapButton>
      </View>

      {/* ── The sheet ───────────────────────────────────────────────── */}
      <DragSheet
        snaps={snaps}
        index={sheet}
        onIndexChange={setSheet}
        header={
          <View className="pb-3.5">
            <Pressable onPress={() => router.push(`/brands/${t.brand.id}`)} className="flex-row items-center" style={{ gap: 8 }}>
              <BrandAvatar src={t.brand.imageUrl} style={{ width: 24, height: 24, borderRadius: 8 }} />
              <Text className="font-hud min-w-0 flex-1 text-[10.5px] font-semibold uppercase tracking-[1.3px] text-ar-dim" numberOfLines={1}>
                {t.brand.name}
              </Text>
              {t.runners > 0 && (
                <View className="flex-row items-center" style={{ gap: 4 }}>
                  <Users size={11} color={c("ar-text-faint")} />
                  <Text className="font-hud text-[10.5px] font-semibold text-ar-faint">{t.runners} on it</Text>
                </View>
              )}
            </Pressable>
            <Text className="font-hud mt-1.5 text-[19px] font-bold leading-tight text-ar-text" numberOfLines={2}>
              {t.title}
            </Text>
            <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 6 }}>
              <Chip>{`${total} stops`}</Chip>
              <Chip>{distanceLabel(t.distanceMetres)}</Chip>
              <Chip>{`~${t.estMinutes} min ${MODE_VERB[t.mode] ?? ""}`}</Chip>
              <Chip>{t.order === "ORDERED" ? "In order" : "Any order"}</Chip>
              {t.reward && !t.reward.claimed && t.reward.remaining > 0 && (
                <Chip accent>
                  <Gift size={11} color={c("ar-green-hot")} />
                </Chip>
              )}
            </View>

            {t.run && (
              <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
                <View className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: c("ar-text", 0.1) }}>
                  <View className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }} />
                </View>
                <Text className="font-hud text-[11px] font-bold text-ar-dim">
                  {done}/{total}
                </Text>
              </View>
            )}

            {complete && t.reward && (
              <View className="mt-3 flex-row items-center" style={{ gap: 6 }}>
                <Trophy size={14} color={c("ar-green-hot")} />
                <Text className="min-w-0 flex-1 text-[12.5px] text-ar-text" numberOfLines={1}>
                  {t.reward.claimed ? `You finished! ${t.reward.name} is yours.` : canClaim ? `You finished! Claim ${t.reward.name}.` : "You finished! The rewards ran out."}
                </Text>
              </View>
            )}
            <View className="mt-3">{primary}</View>
            {error && <Text className="mt-2 text-[12px] text-ar-danger">{error}</Text>}
          </View>
        }
      >
        {t.reward && (
          <Bevel className="mb-4 flex-row items-center rounded-ar-lg p-3.5" style={{ borderRadius: 18, gap: 12 }}>
            {t.reward.thumbnail ? (
              <Image source={{ uri: t.reward.thumbnail }} style={{ width: 44, height: 44, borderRadius: 10 }} contentFit="cover" />
            ) : (
              <Gift size={22} color={c("ar-green-hot")} />
            )}
            <View className="min-w-0 flex-1">
              <Text className="text-[10.5px] uppercase tracking-[1.2px] text-ar-faint">Finishing reward</Text>
              <Text className="text-[13.5px] font-semibold text-ar-text" numberOfLines={1}>
                {t.reward.name}
              </Text>
              <Text className="text-[11.5px] text-ar-dim">
                {t.reward.claimed ? "Claimed: it's in your collection" : t.reward.remaining > 0 ? `${t.reward.remaining} left` : "All claimed"}
              </Text>
            </View>
          </Bevel>
        )}
        {redeemCode && (
          <Bevel className="mb-4 items-center rounded-ar-lg p-3" style={{ borderRadius: 18 }}>
            <Text className="text-[10.5px] uppercase tracking-[1.2px] text-ar-faint">Redeem code</Text>
            <Text selectable className="font-hud mt-1 text-[17px] font-bold tracking-[2.4px] text-ar-text">
              {redeemCode}
            </Text>
          </Bevel>
        )}

        {t.description ? (
          <>
            <Text className="font-hud mb-1.5 text-[10px] font-semibold uppercase tracking-[2.8px] text-ar-faint">About</Text>
            <Text className="text-[14px] leading-[22px] text-ar-dim">{t.description}</Text>
          </>
        ) : null}

        <View className="mt-3 flex-row items-center" style={{ gap: 6 }}>
          <Footprints size={12} color={c("ar-text-faint")} />
          <Text className="flex-1 text-[11.5px] text-ar-faint">
            {t.order === "ORDERED" ? "Collect the stops in order: each one unlocks the next." : "Collect the stops in any order."}
            {requiredTotal < total ? " Optional stops are a bonus." : ""}
          </Text>
        </View>

        <Text className="font-hud mb-2 mt-6 text-[10px] font-semibold uppercase tracking-[2.8px] text-ar-faint">Stops</Text>
        <View style={{ gap: 8 }}>
          {t.stops.map((s) => (
            <StopRow key={s.position} stop={s} isNext={next?.position === s.position && !complete} focused={focused === s.position} color={color} onPress={() => focusStop(s.position)} />
          ))}
        </View>
      </DragSheet>
    </View>
  );
}

function MapButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const { c } = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-10 items-center justify-center rounded-full border"
      style={{ borderColor: c("ar-line"), backgroundColor: c("ar-surface", 0.92) }}
    >
      {children}
    </Pressable>
  );
}

function Chip({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  const { c } = useColors();
  return (
    <View className="flex-row items-center rounded-full border px-2.5 py-1" style={{ gap: 4, borderColor: accent ? c("ar-green", 0.5) : c("ar-line") }}>
      {typeof children === "string" ? <Text className="font-hud text-[10.5px] font-semibold text-ar-dim">{children}</Text> : children}
      {accent && (
        <Text className="font-hud text-[10.5px] font-semibold" style={{ color: c("ar-green-hot") }}>
          Reward
        </Text>
      )}
    </View>
  );
}

type Stop = ArTrail["stops"][number];

function StopRow({ stop: s, isNext, focused, color, onPress }: { stop: Stop; isNext: boolean; focused: boolean; color: string; onPress: () => void }) {
  const { c } = useColors();
  const dim = (Boolean(s.lockReason) || s.unavailable) && !s.done;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Stop ${s.position}: ${s.title}. Show on the map`}
      className="flex-row items-center rounded-ar border p-2.5"
      style={{
        gap: 12,
        opacity: dim ? 0.6 : 1,
        borderColor: focused || isNext ? c("ar-green", 0.5) : c("ar-line"),
        backgroundColor: focused ? c("ar-green", 0.08) : c("ar-text", 0.03),
      }}
    >
      <View className="items-center justify-center rounded-full" style={{ width: 28, height: 28, backgroundColor: s.required ? color : c("ar-text", 0.2) }}>
        {s.done ? (
          <Check size={14} strokeWidth={3} color="#ffffff" />
        ) : (
          <Text className="font-hud text-[12px] font-bold" style={{ color: "#ffffff" }}>
            {s.position}
          </Text>
        )}
      </View>
      <Image source={{ uri: s.imageUrl }} style={{ width: 40, height: 40, borderRadius: 10 }} contentFit="cover" />
      <View className="min-w-0 flex-1">
        <Text className="text-[13px] font-semibold text-ar-text" numberOfLines={1}>
          {s.title}
        </Text>
        <Text className="text-[11.5px] text-ar-dim" numberOfLines={1}>
          {s.done ? "Collected" : s.unavailable ? "No longer available" : (s.lockReason ?? s.clue ?? (s.required ? "Next up" : "Optional bonus stop"))}
        </Text>
      </View>
      {s.lockReason && !s.done && <Lock size={14} color={c("ar-text-faint")} />}
    </Pressable>
  );
}
