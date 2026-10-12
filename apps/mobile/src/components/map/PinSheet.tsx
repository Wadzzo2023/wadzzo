import { Image } from "expo-image";
import { router } from "expo-router";
import { Bike, Bus, Car, Footprints, Navigation, Package, ScanLine, Timer, type LucideIcon } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { ArButton } from "~/components/ui/ArButton";
import { DETECTION_META, DetectionBadge, RarityPlate, StatusBadge } from "~/components/ui/Badges";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Text } from "~/components/ui/Text";
import { AR_CAPTURE_RADIUS, bearingDegrees, compassPoint, distanceMeters, formatDistance, travelMinutes } from "~/lib/ar/geo";
import { pinStatus, timeRemaining } from "~/lib/ar/rarity";
import type { ArPin, GeoFix, TravelMode } from "~/lib/ar/types";
import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

const MODES: { id: TravelMode; icon: LucideIcon; label: string }[] = [
  { id: "walk", icon: Footprints, label: "Walk" },
  { id: "cycle", icon: Bike, label: "Cycle" },
  { id: "transit", icon: Bus, label: "Transit" },
  { id: "drive", icon: Car, label: "Drive" },
];

/**
 * Port of the web's PinSheet: everything needed to decide "is this worth
 * walking to?". The primary action flips with proximity — inside 75 m it's
 * Capture, outside it's Directions.
 */
export const PinSheet = memo(function PinSheet({ pin, fix, onClose, onCapture, onDirections }: { pin: ArPin | null; fix: GeoFix | null; onClose: () => void; onCapture: (pin: ArPin) => void; onDirections: (pin: ArPin, mode: TravelMode) => void }) {
  const [mode, setMode] = useState<TravelMode>("walk");
  // Keep showing the last pin while the sheet slides away: `pin` goes null the
  // moment it starts closing, and dropping the body then collapsed the sheet
  // to an empty strip mid-animation (the jumpy close).
  const [shown, setShown] = useState<ArPin | null>(pin);
  if (pin && pin !== shown) setShown(pin);
  return (
    <BottomSheet open={Boolean(pin)} onClose={onClose} onClosed={() => setShown(null)}>
      {shown && <Body pin={shown} fix={fix} mode={mode} setMode={setMode} onCapture={onCapture} onDirections={onDirections} onClose={onClose} />}
    </BottomSheet>
  );
});

function Body({ pin, fix, mode, setMode, onCapture, onDirections, onClose }: { pin: ArPin; fix: GeoFix | null; mode: TravelMode; setMode: (m: TravelMode) => void; onCapture: (p: ArPin) => void; onDirections: (p: ArPin, m: TravelMode) => void; onClose: () => void }) {
  const { c } = useColors();
  const status = pinStatus(pin);
  const ends = timeRemaining(pin.endsAt);
  const distance = fix ? distanceMeters(fix, pin) : null;
  const bearing = fix ? bearingDegrees(fix, pin) : null;
  const inRange = distance != null && distance <= AR_CAPTURE_RADIUS;
  const detection = DETECTION_META[pin.detection];
  const toBrand = () => {
    onClose();
    router.push(`/brands/${pin.brandId}`);
  };

  return (
    <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 12, paddingTop: 8 }}>
      <View className="flex-row gap-3.5">
        <Pressable onPress={() => { onClose(); router.push(`/collection/${pin.id}`); }} className="h-[92px] w-[66px] overflow-hidden rounded-[11px] border border-ar-line bg-ar-surface-2">
          <Image source={{ uri: pin.imageUrl }} style={{ width: "100%", height: "100%", opacity: status === "expired" || status === "depleted" ? 0.5 : 1 }} contentFit="cover" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <View className="mb-1.5 flex-row flex-wrap items-center gap-1.5">
            <RarityPlate rarity={pin.rarity} size="sm" />
            <StatusBadge status={status} />
          </View>
          <Text className="font-hud text-[17px] font-bold leading-5 text-ar-text">{pin.title}</Text>
          <Pressable onPress={toBrand} className="mt-1.5 flex-row items-center gap-1.5 self-start">
            <BrandAvatar src={pin.brandImageUrl} style={{ width: 16, height: 16, borderRadius: 8 }} />
            <Text numberOfLines={1} className="text-[12px] text-ar-dim">{pin.brandName}</Text>
          </Pressable>
        </View>
      </View>

      {pin.description ? <Text className="mt-3.5 text-[13px] leading-5 text-ar-dim">{pin.description}</Text> : null}

      <View className="mt-4 flex-row gap-2">
        <Fact icon={Navigation} label="Distance" value={distance != null ? formatDistance(distance) : "—"} sub={bearing != null ? compassPoint(bearing) : undefined} accent={inRange} />
        <Fact icon={Package} label="Left" value={pin.remaining > 0 ? String(pin.remaining) : "0"} sub={pin.supply != null ? `of ${pin.supply.toLocaleString()}` : "Open drop"} />
        <Fact icon={Timer} label="Window" value={ends ? ends.label.replace(" left", "") : "Open"} sub={ends ? undefined : "No end date"} danger={ends?.urgent} />
      </View>

      <View className="mt-3 flex-row items-start gap-2.5 rounded-ar border border-ar-line bg-ar-text/5 p-3">
        <DetectionBadge method={pin.detection} />
        <Text className="flex-1 text-[11.5px] leading-5 text-ar-faint">{detection.hint}</Text>
      </View>

      {distance != null && !inRange && status !== "collected" && (
        <View className="mt-4">
          <Text className="font-hud mb-2 text-[9.5px] font-semibold uppercase tracking-[2.2px] text-ar-faint">Getting there</Text>
          <View className="flex-row gap-1.5">
            {MODES.map(({ id, icon: Icon, label }) => {
              const active = mode === id;
              const fg = active ? c("ar-green-hot") : c("ar-text-faint");
              return (
                <Pressable
                  key={id}
                  onPress={() => setMode(id)}
                  accessibilityState={{ selected: active }}
                  className="flex-1 items-center gap-1 rounded-[12px] border px-1 py-2"
                  style={{ borderColor: active ? c("ar-green", 0.6) : c("ar-line"), backgroundColor: active ? c("ar-green", 0.12) : c("ar-text", 0.03) }}
                >
                  <Icon size={16} strokeWidth={2.1} color={fg} />
                  <Text className="font-hud text-[12px] font-bold" style={{ color: fg, fontVariant: ["tabular-nums"] }}>
                    {travelMinutes(distance, id)}
                    <Text className="font-hud text-[8.5px] font-medium" style={{ color: fg }}> min</Text>
                  </Text>
                  <Text className="font-hud text-[8px] uppercase tracking-[1px]" style={{ color: fg }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View className="mt-5 gap-2">
        {inRange && status === "collectible" ? (
          <ArButton variant="primary" size="lg" block icon={ScanLine} onPress={() => onCapture(pin)}>
            Capture in AR
          </ArButton>
        ) : status === "collectible" ? (
          <>
            <ArButton variant="primary" size="lg" block icon={Navigation} onPress={() => onDirections(pin, mode)}>
              {`Directions · ${formatDistance(distance ?? 0)}`}
            </ArButton>
            <Text className="text-center text-[11px] text-ar-faint">Get within {AR_CAPTURE_RADIUS} m to capture this one.</Text>
          </>
        ) : (
          <>
            <ArButton size="lg" block disabled>
              {status === "locked" ? "Locked" : status === "collected" ? "In your collection" : "No longer available"}
            </ArButton>
            {status === "locked" && pin.lockReason && <Text className="text-center text-[11px] text-ar-faint">{pin.lockReason}</Text>}
          </>
        )}
        <ArButton variant="ghost" size="md" block onPress={toBrand}>
          {`More from ${pin.brandName}`}
        </ArButton>
      </View>
    </ScrollView>
  );
}

function Fact({ icon: Icon, label, value, sub, accent, danger }: { icon: LucideIcon; label: string; value: string; sub?: string; accent?: boolean; danger?: boolean }) {
  const { c } = useColors();
  return (
    <View
      className={cn("flex-1 rounded-ar border px-2.5 py-2.5")}
      style={{ borderColor: accent ? c("ar-green", 0.45) : c("ar-line"), backgroundColor: accent ? c("ar-green", 0.08) : c("ar-text", 0.03) }}
    >
      <View className="mb-1 flex-row items-center gap-1.5">
        <Icon size={11} strokeWidth={2.4} color={c("ar-text-faint")} />
        <Text className="font-hud text-[8.5px] font-semibold uppercase tracking-[1.4px] text-ar-faint">{label}</Text>
      </View>
      <Text className="font-hud text-[14px] font-bold" style={{ color: accent ? c("ar-green-hot") : danger ? c("ar-danger") : c("ar-text"), fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      {sub && <Text className="mt-0.5 text-[9.5px] text-ar-faint">{sub}</Text>}
    </View>
  );
}
