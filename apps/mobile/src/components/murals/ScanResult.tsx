import { Coins, MapPinOff, MonitorX, PencilLine, RotateCcw, ShieldAlert, Sparkles, TriangleAlert, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";

import { Confetti } from "~/components/fx/Confetti";
import { ArButton } from "~/components/ui/ArButton";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { RejectCode, ScanResult as Result } from "~/lib/murals/constants";
import { useColors } from "~/theme/theme";

/**
 * Native port of wadzzoAR's ScanResult (plan §6.7): collected · discovered ·
 * rejected. The photo is the person's own centre keyframe.
 */

const REJECT_ICON: Partial<Record<RejectCode, LucideIcon>> = {
  SCREEN: MonitorX,
  WEB_COPY: MonitorX,
  GPS_WEAK: MapPinOff,
  UNSAFE: ShieldAlert,
  MURAL_REJECTED: ShieldAlert,
};

function useCountUp(to: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 900);
      setV(Math.round(to * (1 - (1 - t) ** 3)));
      if (t >= 1) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [to]);
  return v;
}

function Dots({ filled, total }: { filled: number; total: number }) {
  const { c } = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i < filled ? c("rarity-epic") : c("ar-text", 0.2) }} />
      ))}
    </View>
  );
}

export function ScanResult({
  result,
  photo,
  onDone,
  onRetry,
  onName,
}: {
  result: Result;
  photo: string | null;
  onDone: () => void;
  onRetry: () => void;
  onName: () => void;
}) {
  const { c } = useColors();
  const gold = c("rarity-legendary");
  const total = result.kind === "rejected" ? 0 : result.coins + (result.kind === "discovered" ? result.bonus : 0);
  const shown = useCountUp(total);
  // A discovery fires the confetti once, on mount.
  const burst = result.kind === "discovered" ? 1 : 0;

  if (result.kind === "rejected") {
    const Icon = REJECT_ICON[result.code] ?? TriangleAlert;
    return (
      <Animated.View entering={FadeInDown.duration(220)} style={{ width: "100%", maxWidth: 304 }}>
        <Glass style={{ borderRadius: 22, padding: 24, alignItems: "center" }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: c("ar-danger", 0.6), backgroundColor: c("ar-danger", 0.15), alignItems: "center", justifyContent: "center" }}>
            <Icon size={22} strokeWidth={2.3} color={c("ar-danger")} />
          </View>
          <Text className="font-hud mt-3 text-[13px] font-bold uppercase tracking-[1.5px] text-ar-text">Couldn&apos;t collect</Text>
          <Text className="mt-1.5 text-center text-[12px] leading-[18px] text-ar-dim">{result.message}</Text>
          <View style={{ marginTop: 16, gap: 8, alignSelf: "stretch" }}>
            {result.retryable && (
              <ArButton variant="primary" size="md" icon={RotateCcw} onPress={onRetry}>
                Try again
              </ArButton>
            )}
            <ArButton variant={result.retryable ? "ghost" : "primary"} size="md" onPress={onDone}>
              Done
            </ArButton>
          </View>
        </Glass>
      </Animated.View>
    );
  }

  const { mural } = result;
  const discovered = result.kind === "discovered";
  const first = discovered && result.rank === 1;
  const verified = mural.status === "APPROVED";

  return (
    <>
      <Confetti trigger={burst} rarity="epic" origin={{ x: 0.5, y: 0.3 }} count={110} />
      <Animated.View entering={FadeInDown.duration(220)} style={{ width: "100%", maxWidth: 312 }}>
        <Glass style={{ borderRadius: 22, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, alignItems: "center" }}>
          {discovered && (
            <View style={{ position: "absolute", top: 10, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, borderColor: c("rarity-epic", 0.7), paddingHorizontal: 10, paddingVertical: 3 }}>
              <Sparkles size={11} strokeWidth={2.6} color={c("rarity-epic")} />
              <Text className="font-hud text-[9.5px] font-bold uppercase tracking-[1.6px] text-rarity-epic">{first ? "Discoverer" : `Finder #${result.rank}`}</Text>
            </View>
          )}

          {photo && (
            <Animated.View entering={ZoomIn.springify().damping(16)} style={{ marginTop: discovered ? 18 : 0, width: 106, height: 132, borderRadius: 14, borderWidth: 2, borderColor: c("rarity-epic", 0.8), padding: 3, transform: [{ rotate: "-2deg" }] }}>
              <Image source={{ uri: photo }} style={{ flex: 1, borderRadius: 10 }} />
              <View style={{ position: "absolute", bottom: -10, alignSelf: "center", borderRadius: 999, borderWidth: 1, borderColor: verified ? c("ar-green", 0.6) : "rgba(255,255,255,0.3)", backgroundColor: c("ar-void"), paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text className="font-hud text-[8.5px] font-bold uppercase tracking-[1.4px]" style={{ color: verified ? c("ar-green-hot") : c("ar-text-dim") }}>
                  {verified ? "Verified" : "Unverified"}
                </Text>
              </View>
            </Animated.View>
          )}

          <Text className="font-hud mt-5 text-center text-[15px] font-bold leading-[19px] text-ar-text">
            {discovered ? (first ? "You discovered a new mural!" : "You helped verify this mural!") : mural.title}
          </Text>
          {discovered && <Text className="mt-1 text-[12px] text-ar-dim">{mural.title}</Text>}

          <View style={{ marginTop: 16, alignSelf: "stretch", borderRadius: 16, borderWidth: 1, borderColor: c("rarity-legendary", 0.35), backgroundColor: c("rarity-legendary", 0.1), paddingVertical: 12, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Coins size={22} strokeWidth={2.4} color={gold} />
              <Text className="font-hud text-[26px] font-bold" style={{ color: gold }}>
                +{shown}
              </Text>
            </View>
            {discovered && (
              <Text className="mt-1 text-[11px] text-ar-dim">
                {result.coins} scan · <Text style={{ color: gold, fontWeight: "600" }}>{result.bonus} discovery bonus</Text>
              </Text>
            )}
            <Text className="mt-1 text-[10px] uppercase tracking-[1.4px] text-ar-faint">Wadzzo Coins · balance {result.balance.toLocaleString()}</Text>
          </View>

          <View style={{ marginTop: 12, gap: 6, alignItems: "center" }}>
            {discovered && !verified && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Dots filled={Math.min(mural.distinctScanners, mural.confirmationsNeeded)} total={mural.confirmationsNeeded} />
                <Text className="text-[11.5px] text-ar-dim">
                  {mural.distinctScanners >= mural.confirmationsNeeded ? "Sent for review" : `${mural.distinctScanners} of ${mural.confirmationsNeeded} finders`}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Dots filled={result.scansToday} total={result.dailyLimit} />
              <Text className="text-[11.5px] text-ar-dim">
                Scans today {result.scansToday}/{result.dailyLimit}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 16, gap: 8, alignSelf: "stretch" }}>
            {discovered && result.canName ? (
              <>
                <ArButton variant="primary" size="md" icon={PencilLine} onPress={onName}>
                  Name this mural
                </ArButton>
                <ArButton variant="ghost" size="md" onPress={onDone}>
                  Skip
                </ArButton>
              </>
            ) : (
              <>
                <ArButton variant="primary" size="md" onPress={onDone}>
                  Done
                </ArButton>
                <ArButton variant="ghost" size="sm" onPress={onRetry}>
                  Scan another
                </ArButton>
              </>
            )}
          </View>
        </Glass>
      </Animated.View>
    </>
  );
}
