import { Image } from "expo-image";
import { MapPin, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Spinner } from "~/components/ui/Spinner";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import { usePinSearch } from "~/lib/api/queries";
import { distanceMeters, formatDistance } from "~/lib/ar/geo";
import type { ArPin, Coords, GeoFix } from "~/lib/ar/types";
import { useColors } from "~/theme/theme";

const MAX_PINS = 8;
const MAX_PLACES = 5;
const DEBOUNCE_MS = 300;

type Place = { id: string; name: string; address: string; coords: Coords };

/** The map's search trigger: a glass circle that sits beside the filter chip. */
export function MapSearchButton({ onPress }: { onPress: () => void }) {
  const { c } = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Search drops and places" hitSlop={6}>
      <Glass style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
        <Search size={16} strokeWidth={2.4} color={c("ar-text-dim")} />
      </Glass>
    </Pressable>
  );
}

/**
 * ── MapSearch ──────────────────────────────────────────────────────────────
 *
 * Hidden until the search button opens it. One box, two kinds of answer:
 *  - Drops: every live drop on the server (not just the ones loaded for the
 *    area on screen), matched on title / brand / description / tags and
 *    ranked by relevance.
 *  - Places: Mapbox forward geocoding, biased to where you are.
 * Picking a drop selects it (fly-to + sheet); picking a place moves the map.
 */
export function MapSearch({
  open,
  onClose,
  fix,
  onPickPin,
  onPickPlace,
}: {
  open: boolean;
  onClose: () => void;
  fix: GeoFix | null;
  onPickPin: (pin: ArPin) => void;
  onPickPlace: (coords: Coords) => void;
}) {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [placeResults, setPlaces] = useState<Place[]>([]);
  const [placesBusy, setPlacesLoading] = useState(false);
  const q = query.trim().toLowerCase();

  // Debounced so each keystroke isn't its own request.
  const [pinQuery, setPinQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setPinQuery(q), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [q]);
  const search = usePinSearch(pinQuery, fix, open);
  const pinsOn = open && q.length >= 2;
  const pinsLoading = pinsOn && (search.isFetching || pinQuery !== q);
  const pinHits = useMemo(() => {
    if (!pinsOn || !search.data) return [];
    return search.data.slice(0, MAX_PINS).map((p) => ({ pin: p, distance: fix ? distanceMeters(fix, p) : null }));
  }, [pinsOn, search.data, fix]);

  // Places: debounced, and a newer query cancels the older request.
  const bias = useRef(fix);
  useEffect(() => {
    bias.current = fix;
  }, [fix]);
  useEffect(() => {
    if (!open || q.length < 3) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      setPlacesLoading(true);
      searchPlaces(q, bias.current, ctrl.signal)
        .then((found) => {
          if (!ctrl.signal.aborted) setPlaces(found);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!ctrl.signal.aborted) setPlacesLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, open]);
  // Derived, not reset in the effect: below 3 letters there are no places.
  const placesOn = open && q.length >= 3;
  const places = placesOn ? placeResults : [];
  const placesLoading = placesOn && placesBusy;

  const close = () => {
    Keyboard.dismiss();
    setQuery("");
    onClose();
  };

  if (!open) return null;

  const nothing = q.length >= 2 && pinHits.length === 0 && places.length === 0 && !placesLoading && !pinsLoading;

  return (
    <View style={{ position: "absolute", inset: 0, zIndex: 60 }}>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={{ position: "absolute", inset: 0, backgroundColor: c("ar-void", 0.55) }}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityLabel="Close search" />
      </Animated.View>

      <Animated.View entering={FadeInUp.springify().stiffness(420).damping(34)} exiting={FadeOutUp.duration(140)} style={{ paddingTop: insets.top + 12, paddingHorizontal: 12 }}>
        <Glass style={{ height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 6, gap: 10, borderColor: c("ar-green", 0.45) }}>
          <Search size={17} strokeWidth={2.4} color={c("ar-green-hot")} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search drops, brands or places"
            placeholderTextColor={c("ar-text-faint")}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="never"
            className="flex-1 text-[15px] text-ar-text"
            style={{ fontFamily: "Sora_400Regular", height: 44 }}
            accessibilityLabel="Search"
          />
          <Pressable onPress={query ? () => setQuery("") : close} accessibilityRole="button" accessibilityLabel={query ? "Clear search" : "Close search"} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full">
            <X size={17} strokeWidth={2.4} color={c("ar-text-dim")} />
          </Pressable>
        </Glass>

        {q.length >= 2 && (
          <Animated.View entering={FadeIn.duration(140)}>
            <Glass style={{ marginTop: 8, borderRadius: 20, maxHeight: 440 }}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 6 }}>
                {(pinHits.length > 0 || pinsLoading) && <SectionLabel loading={pinsLoading}>Drops</SectionLabel>}
                {pinHits.map(({ pin, distance }) => (
                  <Row
                    key={pin.id}
                    onPress={() => {
                      close();
                      onPickPin(pin);
                    }}
                    leading={<Image source={{ uri: pin.brandImageUrl }} style={{ width: 34, height: 34, borderRadius: 10 }} contentFit="cover" />}
                    title={pin.title}
                    subtitle={pin.brandName}
                    trailing={distance != null ? formatDistance(distance) : undefined}
                  />
                ))}

                {(places.length > 0 || placesLoading) && <SectionLabel loading={placesLoading}>Places</SectionLabel>}
                {places.map((p) => (
                  <Row
                    key={p.id}
                    onPress={() => {
                      close();
                      onPickPlace(p.coords);
                    }}
                    leading={
                      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c("ar-line"), backgroundColor: c("ar-text", 0.04) }}>
                        <MapPin size={16} strokeWidth={2.2} color={c("ar-text-dim")} />
                      </View>
                    }
                    title={p.name}
                    subtitle={p.address}
                    trailing={fix ? formatDistance(distanceMeters(fix, p.coords)) : undefined}
                  />
                ))}

                {nothing && (
                  <View className="items-center px-6 py-6">
                    <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.6px] text-ar-dim">No matches</Text>
                    <Text className="mt-1 text-center text-[12px] text-ar-faint">Try a brand name, a drop title, or a street or area.</Text>
                  </View>
                )}
              </ScrollView>
            </Glass>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

function SectionLabel({ children, loading }: { children: string; loading?: boolean }) {
  return (
    <View className="flex-row items-center gap-2 px-4 pb-1 pt-2.5">
      <Text className="font-hud text-[9.5px] font-semibold uppercase tracking-[2.2px] text-ar-faint">{children}</Text>
      {loading && <Spinner size={11} />}
    </View>
  );
}

function Row({ onPress, leading, title, subtitle, trailing }: { onPress: () => void; leading: ReactNode; title: string; subtitle?: string; trailing?: string }) {
  const { c } = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} style={({ pressed }) => ({ backgroundColor: pressed ? c("ar-green", 0.08) : "transparent" })}>
      <View className="flex-row items-center gap-3 px-4 py-2.5">
        {leading}
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-hud text-[13px] font-bold text-ar-text">{title}</Text>
          {subtitle ? <Text numberOfLines={1} className="mt-0.5 text-[11.5px] text-ar-faint">{subtitle}</Text> : null}
        </View>
        {trailing && (
          <Text className="font-hud text-[10.5px] font-bold text-ar-dim" style={{ fontVariant: ["tabular-nums"] }}>
            {trailing}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** Mapbox Geocoding v6 forward search, biased toward the viewer. */
async function searchPlaces(q: string, near: GeoFix | null, signal: AbortSignal): Promise<Place[]> {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];
  const params = new URLSearchParams({ q, access_token: token, limit: String(MAX_PLACES), autocomplete: "true" });
  if (near) params.set("proximity", `${near.lng},${near.lat}`);
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`, { signal });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    features?: { id: string; properties: { name?: string; full_address?: string; place_formatted?: string; coordinates?: { latitude: number; longitude: number } } }[];
  };
  return (json.features ?? []).flatMap((f) => {
    const co = f.properties.coordinates;
    if (!co || !f.properties.name) return [];
    return [{ id: f.id, name: f.properties.name, address: f.properties.place_formatted ?? f.properties.full_address ?? "", coords: { lat: co.latitude, lng: co.longitude } }];
  });
}
