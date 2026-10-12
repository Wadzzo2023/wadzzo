import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { CalendarPlus, Check, Clock, ExternalLink, MapPin, Navigation, Share2, Target, Users } from "lucide-react-native";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { CommentsSection } from "~/components/events/Comments";
import { BackButton } from "~/components/shell/ScreenHeader";
import { ArButton, ArLinkButton } from "~/components/ui/ArButton";
import { TonePill } from "~/components/ui/Badges";
import { Skeleton } from "~/components/ui/Skeleton";
import { Bevel, Glass, Grid } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { useEventQuery, useRsvp } from "~/lib/api/queries";
import type { ArEventDetail } from "~/lib/api/types";
import { directionsUrl, eventIcsUrl, eventWebUrl, eventWhen, liveState, spotsLabel, venueMapImage } from "~/lib/ar/events";
import { useSession } from "~/lib/auth/session";
import { useColors } from "~/theme/theme";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

/**
 * ── /events/[id] ───────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's event page: when, where, how to get in, who's going,
 * with the RSVP pinned at the bottom. Add-to-calendar opens the server's
 * .ics in the in-app browser (iOS answers with its own "Add to Calendar"
 * sheet), so no native calendar module — and no new dev build — is needed.
 */
export default function EventScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const detail = useEventQuery(id);
  const event = detail.data;

  if (detail.isLoading) {
    return (
      <View className="flex-1 bg-ar-bg">
        <Skeleton className="h-[220px] w-full rounded-none" />
        <View className="px-5">
          <Skeleton className="-mt-8 h-[56px] w-[56px] rounded-[16px]" />
          <Skeleton className="mt-3 h-5 w-4/5 rounded-full" />
          <Skeleton className="mt-4 h-[150px] w-full rounded-ar-lg" />
        </View>
      </View>
    );
  }
  if (!event) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-ar-bg px-8">
        <Text className="font-hud text-[15px] font-bold uppercase tracking-[1.8px] text-ar-dim">
          {(detail.error as { status?: number } | null)?.status === 404 ? "Event not found" : "Couldn't load this event"}
        </Text>
        <ArLinkButton href="/events" variant="primary">All events</ArLinkButton>
      </View>
    );
  }

  const state = liveState(event);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} className="bg-ar-bg">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <View style={{ height: 220 }}>
          {event.coverImage ? (
            <Image source={{ uri: event.coverImage }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <>
              <LinearGradient colors={[c("ar-green", 0.25), c("ar-surface"), c("ar-bg")]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <Grid />
            </>
          )}
          <LinearGradient pointerEvents="none" colors={[c("ar-void", 0.7), c("ar-bg", 0), c("ar-bg")]} style={StyleSheet.absoluteFill} />
          <View style={{ position: "absolute", left: 16, right: 16, top: insets.top + 14, flexDirection: "row", justifyContent: "space-between" }}>
            <BackButton fallback="/events" />
            <Pressable onPress={() => void Share.share({ title: event.title, message: `${event.title}\n${eventWebUrl(event.id)}`, url: eventWebUrl(event.id) })} accessibilityLabel="Share this event">
              <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
                <Share2 size={15} strokeWidth={2.2} color={c("ar-text")} />
              </Glass>
            </Pressable>
          </View>
          {state && (
            <View style={{ position: "absolute", right: 20, bottom: 40 }}>
              <TonePill tone={state === "live" ? "green" : "muted"} label={state === "live" ? "Happening now" : "Ended"} />
            </View>
          )}
        </View>

        {/* ── Identity ─────────────────────────────────────────────── */}
        <View className="-mt-8 px-5">
          <Pressable onPress={() => router.push(`/brands/${event.brand.id}`)} className="flex-row items-end gap-2.5 self-start">
            <BrandAvatar src={event.brand.imageUrl} style={{ width: 56, height: 56, borderRadius: 16, borderWidth: 3, borderColor: c("ar-bg") }} />
            <Text className="font-hud mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-ar-dim">{event.brand.name}</Text>
          </Pressable>
          <Text className="mt-3 text-[21px] font-semibold leading-7 text-ar-text">{event.title}</Text>
        </View>

        {/* ── Facts ────────────────────────────────────────────────── */}
        <View className="mx-5 mt-4 overflow-hidden rounded-ar-lg border border-ar-line bg-ar-surface" style={{ borderRadius: 22 }}>
          <FactRow icon={Clock} title={eventWhen(event)}>
            {!event.isPast && <PillButton icon={CalendarPlus} label="Add" onPress={() => void openIcs(event.id)} />}
          </FactRow>
          <Venue event={event} />
          {event.link && (
            <Pressable onPress={() => void WebBrowser.openBrowserAsync(event.link!)} className="border-t border-ar-line">
              <FactRow icon={ExternalLink} title={event.linkLabel ?? "Tickets & info"} subtitle={event.link.replace(/^https?:\/\//, "")} />
            </Pressable>
          )}
          <View className="border-t border-ar-line">
            <FactRow icon={Users} title={spotsLabel(event)} titleColor={event.isFull ? c("rarity-legendary") : undefined}>
              {event.capacity != null && <Text className="font-hud text-[11px] text-ar-faint">{event.goingCount} going</Text>}
            </FactRow>
          </View>
        </View>

        {/* ── About ────────────────────────────────────────────────── */}
        <View className="px-5 pt-5">
          <Text className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-green">About</Text>
          <Text selectable className="text-[14px] leading-[22px] text-ar-dim">{event.description}</Text>
        </View>

        <Linked event={event} />

        <View className="px-5 pt-6">
          <CommentsSection target={{ kind: "event", id: event.id }} />
        </View>
      </ScrollView>

      <View className="rounded-t-ar-xl border border-b-0 border-ar-line bg-ar-surface px-4 pt-3" style={{ paddingBottom: Math.max(12, insets.bottom) }}>
        <RsvpAction event={event} />
      </View>
    </KeyboardAvoidingView>
  );
}

async function openIcs(id: string) {
  // iOS: SFSafariViewController shows the native Add-to-Calendar sheet for
  // text/calendar. Android: the browser downloads it and the calendar app opens it.
  if (Platform.OS === "ios") await WebBrowser.openBrowserAsync(eventIcsUrl(id));
  else await Linking.openURL(eventIcsUrl(id));
}

function FactRow({
  icon: Icon,
  title,
  subtitle,
  titleColor,
  children,
}: {
  icon: typeof Clock;
  title: string;
  subtitle?: string | null;
  titleColor?: string;
  children?: React.ReactNode;
}) {
  const { c } = useColors();
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Icon size={16} strokeWidth={2.3} color={c("ar-green-hot")} />
      <View className="min-w-0 flex-1">
        <Text className="text-[13.5px] font-semibold text-ar-text" style={titleColor ? { color: titleColor } : undefined}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} className="text-[11.5px] leading-4 text-ar-faint">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function PillButton({ icon: Icon, label, onPress }: { icon: typeof Clock; label: string; onPress: () => void }) {
  const { c } = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} className="flex-row items-center gap-1 rounded-full border border-ar-line-bright px-2.5 py-1">
      <Icon size={12} strokeWidth={2.4} color={c("ar-text-dim")} />
      <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1px] text-ar-dim">{label}</Text>
    </Pressable>
  );
}

function Venue({ event }: { event: ArEventDetail }) {
  const { theme } = useColors();
  const place = event.venueName ?? event.address;
  const hasPin = event.latitude != null && event.longitude != null;
  if (!place && !hasPin) return null;
  const go = () => hasPin && void Linking.openURL(directionsUrl(event.latitude!, event.longitude!));
  return (
    <View className="border-t border-ar-line">
      <FactRow icon={MapPin} title={place ?? "Venue"} subtitle={event.venueName && event.address ? event.address : null}>
        {hasPin && <PillButton icon={Navigation} label="Go" onPress={go} />}
      </FactRow>
      {hasPin && MAPBOX_TOKEN ? (
        <Pressable onPress={go} accessibilityLabel="Open directions" className="px-4 pb-3">
          <Image
            source={{ uri: venueMapImage(event.latitude!, event.longitude!, MAPBOX_TOKEN, theme) }}
            style={{ width: "100%", height: 130, borderRadius: 16 }}
            contentFit="cover"
            transition={200}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function Linked({ event }: { event: ArEventDetail }) {
  const { c } = useColors();
  if (event.pins.length === 0 && event.bounties.length === 0) return null;
  const tiles = [
    ...event.pins.map((p) => ({ key: `p-${p.id}`, label: "Drop", title: p.title, image: p.imageUrl as string | null, go: () => router.push(`/directions/${p.id}`) })),
    ...event.bounties.map((b) => ({ key: `b-${b.id}`, label: "Bounty", title: b.title, image: b.imageUrl, go: () => router.push(`/bounty/${b.id}`) })),
  ];
  return (
    <View className="pt-6">
      <Text className="font-hud mb-2 px-5 text-[9.5px] font-semibold uppercase tracking-[2.4px] text-ar-green">At this event</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
        {tiles.map((t) => (
          <Pressable key={t.key} onPress={t.go} accessibilityRole="button" accessibilityLabel={`${t.label}: ${t.title}`}>
            <Bevel className="overflow-hidden rounded-ar" style={{ width: 140, borderRadius: 16 }}>
              <View style={{ height: 84 }}>
                {t.image ? (
                  <Image source={{ uri: t.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: c("ar-green", 0.12) }]}>
                    <Target size={22} color={c("ar-green-hot")} />
                  </View>
                )}
                <Glass style={{ position: "absolute", left: 6, top: 6, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text className="font-hud text-[9px] font-semibold uppercase tracking-[1.2px] text-ar-green-hot">{t.label}</Text>
                </Glass>
              </View>
              <Text numberOfLines={2} className="px-2.5 py-2 text-[12px] font-semibold leading-4 text-ar-text">{t.title}</Text>
            </Bevel>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** The one thing to do next: sign in, RSVP, un-RSVP — or why you can't. */
function RsvpAction({ event }: { event: ArEventDetail }) {
  const user = useSession((s) => s.user);
  const requireAuth = useSession((s) => s.requireAuth);
  const rsvp = useRsvp(event.id);

  if (event.isPast) {
    return <ArButton block size="lg" variant="outline" disabled>This event has ended</ArButton>;
  }
  return (
    <View>
      {rsvp.error && <Text className="mb-2 text-center text-[12px] text-ar-danger">{rsvp.error.message}</Text>}
      {event.viewer.going ? (
        <ArButton block size="lg" variant="outline" icon={Check} busy={rsvp.isPending} onPress={() => rsvp.mutate(false)}>
          You&rsquo;re going · Tap to cancel
        </ArButton>
      ) : event.isFull ? (
        <ArButton block size="lg" variant="outline" disabled>This event is full</ArButton>
      ) : (
        <ArButton
          block
          size="lg"
          variant="primary"
          busy={rsvp.isPending}
          onPress={() => {
            if (!requireAuth("events", () => rsvp.mutate(true))) return;
            rsvp.mutate(true);
          }}
        >
          {user ? "I'm going" : "Sign in to RSVP"}
        </ArButton>
      )}
    </View>
  );
}
