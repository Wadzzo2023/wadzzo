import { Image as ImageIcon, Lock, QrCode, Satellite } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { RARITY_META, STATUS_META } from "~/lib/ar/rarity";
import type { DetectionMethod, PinStatus, Rarity } from "~/lib/ar/types";
import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

import { PulseDot } from "./PulseDot";
import { Text } from "./Text";

/**
 * Ports of wadzzoAR/src/components/ui/Badges.tsx: RarityPlate, StatusBadge,
 * DetectionBadge, Chip, StatBlock.
 */

export function RarityPlate({
  rarity,
  size = "md",
  showLabel = true,
}: {
  rarity: Rarity;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const { rarity: rc } = useColors();
  const meta = RARITY_META[rarity];
  const sm = size === "sm";
  return (
    <View
      className="flex-row items-center"
      style={{
        height: sm ? 18 : 22,
        paddingHorizontal: sm ? 6 : 8,
        gap: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: rc(rarity, 0.55),
        backgroundColor: rarity === "mythic" ? rc("mythic", 0.85) : rc(rarity, 0.14),
      }}
    >
      <Text className="font-hud font-bold uppercase" style={{ fontSize: sm ? 8.5 : 10, letterSpacing: 1.2, color: rarity === "mythic" ? "#fff" : rc(rarity) }}>
        {meta.short}
      </Text>
      {showLabel && (
        <Text className="font-hud font-bold uppercase" style={{ fontSize: sm ? 8.5 : 10, letterSpacing: 1, color: rarity === "mythic" ? "#fff" : rc(rarity) }}>
          {meta.label}
        </Text>
      )}
    </View>
  );
}

export type Tone = "green" | "gold" | "danger" | "muted" | "info";

export function useTone() {
  const { c } = useColors();
  return (tone: Tone) => {
    switch (tone) {
      case "green":
        return { border: c("ar-green", 0.5), bg: c("ar-green", 0.15), fg: c("ar-green-hot") };
      case "gold":
        return { border: c("rarity-legendary", 0.5), bg: c("rarity-legendary", 0.15), fg: c("rarity-legendary") };
      case "danger":
        return { border: c("ar-danger", 0.5), bg: c("ar-danger", 0.15), fg: c("ar-danger") };
      case "info":
        return { border: c("rarity-rare", 0.5), bg: c("rarity-rare", 0.15), fg: c("rarity-rare") };
      default:
        return { border: c("ar-line-bright"), bg: c("ar-text", 0.05), fg: c("ar-text-faint") };
    }
  };
}

export function TonePill({ tone, label, icon, className }: { tone: Tone; label: string; icon?: ReactNode; className?: string }) {
  const t = useTone()(tone);
  return (
    <View
      className={cn("h-[22px] flex-row items-center self-start rounded-full px-2.5", className)}
      style={{ gap: 6, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg }}
    >
      {icon}
      <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.2px]" style={{ color: t.fg }}>
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status, className }: { status: PinStatus; className?: string }) {
  const meta = STATUS_META[status];
  const t = useTone()(meta.tone);
  return (
    <TonePill
      tone={meta.tone}
      label={meta.label}
      className={className}
      icon={
        status === "collectible" ? (
          <PulseDot color={t.fg} size={6} />
        ) : status === "locked" ? (
          <Lock size={10} strokeWidth={2.6} color={t.fg} />
        ) : undefined
      }
    />
  );
}

export const DETECTION_META: Record<DetectionMethod, { label: string; icon: typeof QrCode; hint: string }> = {
  gps: { label: "GPS", icon: Satellite, hint: "Unlocks when you're inside the radius. Best in open outdoor space." },
  qr: { label: "QR", icon: QrCode, hint: "Scan the code on the sign. Works indoors, no location permission needed." },
  image: { label: "Scan", icon: ImageIcon, hint: "Point your camera at the object itself — no sign to find." },
};

export function DetectionBadge({ method, className }: { method: DetectionMethod; className?: string }) {
  const { c } = useColors();
  const meta = DETECTION_META[method];
  const Icon = meta.icon;
  return (
    <View
      className={cn("h-[22px] flex-row items-center self-start rounded-full border border-ar-line-bright bg-ar-text/5 px-2.5", className)}
      style={{ gap: 6 }}
    >
      <Icon size={11} strokeWidth={2.4} color={c("ar-text-dim")} />
      <Text className="font-hud text-[10px] font-semibold uppercase tracking-[1.2px] text-ar-dim">{meta.label}</Text>
    </View>
  );
}

/** Generic pill for categories, filters, and brand tags. */
export function Chip({
  children,
  active,
  onPress,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  onPress?: () => void;
  className?: string;
}) {
  const { c } = useColors();
  const body = (
    <View
      className={cn("h-8 flex-row items-center rounded-full border px-3.5", className)}
      style={{
        gap: 6,
        borderColor: active ? c("ar-green", 0.6) : c("ar-line"),
        backgroundColor: active ? c("ar-green", 0.15) : c("ar-text", 0.04),
      }}
    >
      {typeof children === "string" ? (
        <Text className="font-hud text-[11px] font-semibold uppercase tracking-[1.1px]" style={{ color: active ? c("ar-green-hot") : c("ar-text-dim") }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}>
      {body}
    </Pressable>
  );
}

/** Label + number, used across profile, brand, and collection headers. */
export function StatBlock({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <View className="items-center" style={{ gap: 2 }}>
      {typeof value === "string" || typeof value === "number" ? (
        <Text className={cn("font-hud text-[19px] font-bold", accent ? "text-ar-green-hot" : "text-ar-text")} style={{ fontVariant: ["tabular-nums"] }}>
          {value}
        </Text>
      ) : (
        value
      )}
      <Text className="font-hud text-[9px] font-semibold uppercase tracking-[1.6px] text-ar-faint">{label}</Text>
    </View>
  );
}
