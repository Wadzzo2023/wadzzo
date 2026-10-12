import { Camera, MapView, MarkerView } from "@rnmapbox/maps";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { BadgeCheck, Box, Calendar, Check, Copy, ExternalLink, Hash, Link2, MapPin, ScanLine, Share2, Ticket, type LucideIcon } from "lucide-react-native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { HoloCard } from "~/components/cards/HoloCard";
import { PackOpening } from "~/components/cards/PackOpening";
import { BackButton } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { Chip, DETECTION_META, DetectionBadge, RarityPlate, StatusBadge } from "~/components/ui/Badges";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Skeleton, SkeletonText } from "~/components/ui/Skeleton";
import { Bevel, Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useToggleFollow } from "~/lib/api/follow";
import { useBrandPinsQuery, useBrandQuery, usePinQuery } from "~/lib/api/queries";
import { pinStatus, RARITY_META, timeRemaining } from "~/lib/ar/rarity";
import { useSession } from "~/lib/auth/session";
import { MAP_STYLE, useColors, useResolvedTheme } from "~/theme/theme";

/** Scroll offset past which the big card (≈ 370pt tall, under the header) is mostly off-screen. */
const CARD_OUT_OF_VIEW = 380;
/** "More from {brand}" cards: about half the screen, like the collection grid. */
const SIBLING_W = 172;

const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Port of wadzzoAR's /collection/[id] — one card, in full. */
export default function CardScreen() {
  const { c, rarity: rc } = useColors();
  const theme = useResolvedTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: pin, isLoading, isError } = usePinQuery(id ?? null);
  const { data: brand } = useBrandQuery(pin?.brandId ?? null);
  const siblingsQ = useBrandPinsQuery({ brandId: pin?.brandId ?? null, tab: "live", pageSize: 7 });
  const follow = useToggleFollow();
  const signedIn = useSession((s) => Boolean(s.user));
  const requireAuth = useSession((s) => s.requireAuth);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // The big card follows the gyroscope; stop that while it's scrolled out of
  // view or another screen is on top, so it isn't redrawing unseen.
  const [cardInView, setCardInView] = useState(true);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const siblings = useMemo(() => siblingsQ.pins.filter((p) => p.id !== id).slice(0, 6), [siblingsQ.pins, id]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-ar-bg px-5" style={{ paddingTop: insets.top + 64 }}>
        <Skeleton className="mx-auto w-[236px] rounded-ar-lg" style={{ aspectRatio: 3 / 4 }} />
        <View className="mx-auto mt-6 w-[260px] items-center gap-2.5">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-3 w-32 rounded-full" />
        </View>
        <SkeletonText lines={3} className="mx-auto mt-7 w-[300px]" />
        <View className="mt-7 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </View>
      </View>
    );
  }
  if (!pin || isError) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ar-bg px-8">
        <Text className="font-hud text-[15px] font-bold uppercase tracking-[1.8px] text-ar-dim">Collectible not found</Text>
        <ArLinkButton href="/collection" variant="primary">
          Back to collection
        </ArLinkButton>
      </View>
    );
  }

  const meta = RARITY_META[pin.rarity];
  const status = pinStatus(pin);
  const ends = timeRemaining(pin.endsAt);
  const detection = DETECTION_META[pin.detection];
  const serial = pin.supply != null ? (Array.from(pin.id).reduce((a, ch) => a + ch.charCodeAt(0), 0) % pin.supply) + 1 : null;
  const brandLike = brand ?? { id: pin.brandId, followed: false };
  const linkHost = webHost(pin.link);

  return (
    <View className="flex-1 bg-ar-bg">
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        scrollEventThrottle={100}
        onScroll={(e) => {
          const inView = e.nativeEvent.contentOffset.y < CARD_OUT_OF_VIEW;
          if (inView !== cardInView) setCardInView(inView);
        }}
      >
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 440 }}>
          <LinearGradient colors={[rc(pin.rarity, 0.3), rc(pin.rarity, 0)]} style={StyleSheet.absoluteFill} />
        </View>

        {/* Clears the floating header (inset + 14 + 36pt buttons + 8). */}
        <View className="px-8 pb-1" style={{ paddingTop: insets.top + 58 }}>
          <Animated.View entering={FadeInDown.springify().stiffness(240).damping(26)} style={{ alignSelf: "center", width: "100%", maxWidth: 264 }}>
            <PackOpening rarity={pin.rarity} openedKey={pin.id}>
              <HoloCard pin={pin} brand={brand} creatorBack interactive showFlipButton motionPaused={!cardInView || !focused} />
            </PackOpening>
          </Animated.View>
          <Text className="font-hud mt-3.5 text-center text-[9px] uppercase tracking-[2px] text-ar-faint">Tilt to foil • Tap Creator for the issuer</Text>
        </View>

        <View className="px-5 pt-4">
          <View className="mb-2.5 flex-row flex-wrap items-center justify-center gap-1.5">
            <RarityPlate rarity={pin.rarity} />
            <StatusBadge status={status} />
            <DetectionBadge method={pin.detection} />
          </View>
          <Text className="font-hud text-center text-[23px] font-bold leading-7 text-ar-text">{pin.title}</Text>
          {pin.description ? <Text className="mt-2.5 text-center text-[13px] leading-5 text-ar-dim">{pin.description}</Text> : null}
          {pin.tags?.length ? (
            <View className="mt-3 flex-row flex-wrap justify-center gap-1.5">
              {pin.tags.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </View>
          ) : null}
          <View className="mt-3.5 flex-row items-center justify-center gap-2">
            <Pressable onPress={() => router.push(`/brands/${pin.brandId}`)}>
              <Glass className="flex-row items-center gap-2 rounded-full py-1 pl-1.5 pr-3" style={{ borderRadius: 999 }}>
                <BrandAvatar src={brand?.avatarUrl ?? pin.brandImageUrl} style={{ width: 20, height: 20, borderRadius: 10 }} />
                <Text className="text-[12px] font-medium text-ar-text">{pin.brandName}</Text>
                {brand?.verified && <BadgeCheck size={13} strokeWidth={2.4} color={c("ar-green-hot")} />}
              </Glass>
            </Pressable>
            <ArButton
              size="sm"
              variant={brand?.followed ? "outline" : "primary"}
              busy={follow.pendingId === pin.brandId}
              onPress={() => {
                const go = () => follow.toggle(brandLike);
                if (!requireAuth("follow", go)) return;
                go();
              }}
            >
              {follow.labelFor(brandLike)}
            </ArButton>
          </View>
          {follow.error && <Text className="mt-2 text-center text-[12px] text-ar-danger">{follow.error}</Text>}
        </View>

        <View className="mt-6 gap-2 px-5">
          <ArButton variant="primary" size="lg" block icon={Box} onPress={() => router.push({ pathname: "/ar", params: { pin: pin.id } })}>
            View in AR
          </ArButton>
          <Text className="text-center text-[11px] leading-5 text-ar-faint">
            {pin.collected ? "It's yours — look around and it floats right in front of you." : "Anyone can view it in AR from here — no distance limit."}
          </Text>
          {!pin.collected && (
            <ArButton
              size="lg"
              block
              icon={ScanLine}
              onPress={() => {
                const go = () => router.push({ pathname: "/ar", params: { target: pin.id } });
                if (!requireAuth("collect", go)) return;
                go();
              }}
            >
              Capture in AR
            </ArButton>
          )}
          {pin.collected && pin.redeemCode && (
            <ArButton
              variant="gold"
              size="lg"
              block
              icon={Ticket}
              disabled={pin.isRedeemed === true}
              onPress={() => {
                if (!requireAuth("redeem", () => setRedeemOpen(true))) return;
                setRedeemOpen(true);
              }}
            >
              {pin.isRedeemed ? "Already redeemed" : "Show redeem code"}
            </ArButton>
          )}
          {linkHost && pin.link && <PinLink href={pin.link} host={linkHost} />}
        </View>

        <Section title="Provenance">
          <Bevel className="rounded-ar" style={{ borderRadius: 16 }}>
            <Row icon={Calendar} label="Collected" value={signedIn && pin.collected ? dateFmt(pin.collectedAt) : "—"} first />
            {serial != null && pin.supply != null && (
              <Row
                icon={Hash}
                label="Serial"
                value={
                  <Text className="font-hud text-[12.5px] font-bold" style={{ fontVariant: ["tabular-nums"] }}>
                    <Text style={{ color: rc(pin.rarity) }}>#{serial.toLocaleString()}</Text>
                    <Text className="text-ar-faint"> / {pin.supply.toLocaleString()}</Text>
                  </Text>
                }
              />
            )}
            <Row icon={detection.icon} label="Claimed by" value={detection.label} />
            <Row icon={Ticket} label="Drop window" value={ends ? ends.label : "No end date"} danger={ends?.urgent} />
            <Row icon={MapPin} label="Remaining" value={pin.supply != null ? `${pin.remaining.toLocaleString()} of ${pin.supply.toLocaleString()}` : pin.remaining.toLocaleString()} />
          </Bevel>
          <Text className="mt-2 px-1 text-[11px] leading-5 text-ar-faint">
            {meta.blurb}. {detection.hint}
          </Text>
        </Section>

        <Section title="Where you found it">
          <View className="h-[168px] overflow-hidden rounded-ar border border-ar-line">
            <MapView style={StyleSheet.absoluteFill} styleURL={MAP_STYLE[theme]} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} logoEnabled={false} scaleBarEnabled={false} compassEnabled={false} attributionEnabled={false}>
              <Camera defaultSettings={{ centerCoordinate: [pin.lng, pin.lat], zoomLevel: 15.4, pitch: 40 }} />
              <MarkerView coordinate={[pin.lng, pin.lat]} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: rc(pin.rarity), backgroundColor: rc(pin.rarity, 0.35) }} />
              </MarkerView>
            </MapView>
            <View className="absolute bottom-2.5 left-3 right-3 flex-row items-center justify-between">
              <View className="rounded-full border border-ar-line px-2.5 py-1" style={{ backgroundColor: c("ar-void", 0.8) }}>
                <Text className="font-hud text-[9.5px] font-semibold text-ar-dim" style={{ fontVariant: ["tabular-nums"] }}>
                  {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </Text>
              </View>
              <Pressable onPress={() => router.navigate({ pathname: "/map", params: { focus: pin.id } })} className="rounded-full border px-2.5 py-1" style={{ borderColor: c("ar-green", 0.5), backgroundColor: c("ar-green", 0.15) }}>
                <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1px] text-ar-green-hot">On the map</Text>
              </Pressable>
            </View>
          </View>
        </Section>

        {siblings.length > 0 && (
          <View className="mt-6">
            <View className="px-5">
              <SectionTitle>{`More from ${pin.brandName}`}</SectionTitle>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingBottom: 8 }}>
              {siblings.map((s) => (
                <View key={s.id} style={{ width: SIBLING_W }}>
                  <HoloCard pin={s} oneFace onPress={() => router.push(`/collection/${s.id}`)} />
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Floating header. Not a sticky ScrollView header: on device the
          sticky wrapper dropped the row layout, stacking the buttons in a
          narrow black box over the card. The fade is its own layer so the
          card shows through it as the page scrolls. */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 30 }}>
        <LinearGradient pointerEvents="none" colors={[c("ar-void"), c("ar-void", 0.85), c("ar-void", 0)]} style={StyleSheet.absoluteFill} />
        <View pointerEvents="box-none" style={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 24, flexDirection: "row", justifyContent: "space-between" }}>
          <BackButton fallback="/collection" />
          <Pressable onPress={() => void Share.share({ title: pin.title, message: `${pin.title} — ${pin.description}` })} accessibilityLabel="Share this collectible">
            <Glass className="h-9 w-9 items-center justify-center rounded-full" style={{ borderRadius: 18 }}>
              <Share2 size={15} strokeWidth={2.2} color={c("ar-text-dim")} />
            </Glass>
          </Pressable>
        </View>
      </View>

      <BottomSheet open={redeemOpen} onClose={() => setRedeemOpen(false)}>
        <View className="items-center px-6 pb-4 pt-3">
          <Text className="font-hud text-[19px] font-bold text-ar-text">Show this at the counter</Text>
          <Text className="mt-1.5 max-w-[18rem] text-center text-[12.5px] leading-5 text-ar-dim">{pin.brandName} scans the code, or types it in. It only works once.</Text>
          <View className="mt-5 rounded-ar-lg bg-white p-3.5">
            <QRCode value={pin.redeemCode ?? "-"} size={168} backgroundColor="#ffffff" color="#07120c" />
          </View>
          <Pressable
            onPress={async () => {
              if (!pin.redeemCode) return;
              await Clipboard.setStringAsync(pin.redeemCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            <Bevel className="mt-4 flex-row items-center gap-2.5 rounded-ar px-4 py-2.5" style={{ borderRadius: 16 }}>
              <Text className="font-hud text-[17px] font-bold tracking-[2.4px] text-ar-text">{pin.redeemCode}</Text>
              {copied ? <Check size={15} strokeWidth={3} color={c("ar-green-hot")} /> : <Copy size={15} strokeWidth={2.2} color={c("ar-text-faint")} />}
            </Bevel>
          </Pressable>
          <Text className="mt-2 text-[10.5px] text-ar-faint">{copied ? "Copied to clipboard" : "Tap the code to copy it"}</Text>
        </View>
      </BottomSheet>
    </View>
  );
}

/** Host of an http(s) URL ("wadzzo.com"), or null for anything else. */
function webHost(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

/**
 * The drop's link (what the brand points you to). Opens in an in-app
 * browser sheet so you land back on the card when you close it.
 */
function PinLink({ href, host }: { href: string; host: string }) {
  const { c } = useColors();
  return (
    <Pressable onPress={() => void WebBrowser.openBrowserAsync(href.trim())} accessibilityRole="link" accessibilityLabel={`Open ${host}`}>
      <Bevel className="mt-1 flex-row items-center gap-3 rounded-ar px-3.5 py-3" style={{ borderRadius: 16 }}>
        <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: c("ar-green", 0.15), borderWidth: 1, borderColor: c("ar-green", 0.4) }}>
          <Link2 size={15} strokeWidth={2.4} color={c("ar-green-hot")} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[1.6px] text-ar-faint">Link</Text>
          <Text numberOfLines={1} className="mt-0.5 text-[13px] font-medium text-ar-text">
            {host}
          </Text>
        </View>
        <ExternalLink size={15} strokeWidth={2.2} color={c("ar-text-faint")} />
      </Bevel>
    </Pressable>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <Text className="font-hud mb-2.5 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-faint">{children}</Text>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-7 px-5">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

function Row({ icon: Icon, label, value, danger, first }: { icon: LucideIcon; label: string; value: ReactNode; danger?: boolean; first?: boolean }) {
  const { c } = useColors();
  return (
    <View className="flex-row items-center justify-between gap-3 px-3.5 py-3" style={{ borderTopWidth: first ? 0 : 1, borderColor: c("ar-line") }}>
      <View className="flex-row items-center gap-2.5">
        <Icon size={14} strokeWidth={2.2} color={c("ar-text-faint")} />
        <Text className="text-[12.5px] text-ar-dim">{label}</Text>
      </View>
      {typeof value === "string" ? (
        <Text className="font-hud text-[12.5px] font-bold" style={{ color: danger ? c("ar-danger") : c("ar-text"), fontVariant: ["tabular-nums"] }}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}
