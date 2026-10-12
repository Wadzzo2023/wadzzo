import { Image } from "expo-image";
import { router } from "expo-router";
import { Coins, Frame, HelpCircle, Navigation, ScanLine, Sparkles } from "lucide-react-native";
import { View } from "react-native";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Text } from "~/components/ui/Text";
import { distanceMeters, formatDistance } from "~/lib/ar/geo";
import type { GeoFix } from "~/lib/ar/types";
import { useMural, type AreaMural } from "~/lib/murals/api";
import { useColors } from "~/theme/theme";

const SCAN_FROM_M = 100;

/**
 * Port of wadzzoAR's MuralSheet: public cover only (never other people's
 * scan photos), distance, your numbers, and "Scan this mural" when close.
 */
export function MuralSheet({ mural, dailyLimit, fix, onClose }: { mural: AreaMural | null; dailyLimit: number; fix: GeoFix | null; onClose: () => void }) {
  const { c } = useColors();
  const detail = useMural(mural?.id ?? "");
  const mine = detail.data?.mine;
  const distance = mural && fix ? distanceMeters(fix, { lat: mural.latitude, lng: mural.longitude }) : null;
  const near = distance != null && distance <= SCAN_FROM_M;
  const verified = mural?.status === "APPROVED";
  const atLimit = mural ? mural.scansToday >= dailyLimit : false;
  const gold = c("rarity-legendary");

  return (
    <BottomSheet open={Boolean(mural)} onClose={onClose}>
      {mural && (
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6 }}>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View style={{ width: 94, height: 118, borderRadius: 12, borderWidth: 2, borderStyle: verified ? "solid" : "dashed", borderColor: c("rarity-epic"), overflow: "hidden" }}>
              <Image source={{ uri: mural.coverUrl }} style={{ flex: 1 }} contentFit="cover" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, borderColor: verified ? c("ar-green", 0.5) : c("rarity-epic", 0.5), paddingHorizontal: 8, paddingVertical: 2 }}>
                {verified ? <Frame size={10} strokeWidth={2.6} color={c("ar-green-hot")} /> : <HelpCircle size={10} strokeWidth={2.6} color={c("rarity-epic")} />}
                <Text className="font-hud text-[9.5px] font-bold uppercase tracking-[1.4px]" style={{ color: verified ? c("ar-green-hot") : c("rarity-epic") }}>
                  {verified ? "Mural" : "Unverified"}
                </Text>
              </View>
              <Text className="font-hud mt-1.5 text-[17px] font-bold leading-[21px] text-ar-text" numberOfLines={2}>
                {mural.title}
              </Text>
              <Text className="mt-0.5 text-[12px] text-ar-dim" numberOfLines={1}>
                {mural.artist ? `by ${mural.artist}` : mural.autoTitled ? "Not named yet" : "Artist unknown"}
              </Text>
              <Text className="mt-2 text-[11.5px] text-ar-faint">
                {distance != null ? `${formatDistance(distance)} away · ` : ""}
                {mural.scanCount} scan{mural.scanCount === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          {!verified && (
            <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: c("rarity-epic", 0.35), backgroundColor: c("rarity-epic", 0.1), paddingHorizontal: 14, paddingVertical: 10 }}>
              <Sparkles size={16} strokeWidth={2.3} color={c("rarity-epic")} />
              <Text className="flex-1 text-[12px] leading-[17px] text-ar-text">
                {mural.distinctScanners < mural.confirmationsNeeded
                  ? `Help verify it — ${mural.distinctScanners} of ${mural.confirmationsNeeded} finders so far. Early finders earn a discovery bonus.`
                  : "Found by enough people — waiting for review. You can still collect it."}
              </Text>
            </View>
          )}

          {mine && (
            <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
              {[
                { label: "Today", value: `${mine.scansToday}/${mine.dailyLimit}` },
                { label: "Your scans", value: String(mine.totalScans) },
                { label: "Coins here", value: mine.coinsEarned.toLocaleString(), gold: true },
              ].map((s) => (
                <View key={s.label} style={{ flex: 1, alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: c("ar-line"), paddingVertical: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {s.gold && <Coins size={13} strokeWidth={2.5} color={gold} />}
                    <Text className="font-hud text-[15px] font-bold" style={{ color: s.gold ? gold : c("ar-text") }}>
                      {s.value}
                    </Text>
                  </View>
                  <Text className="mt-0.5 text-[9.5px] uppercase tracking-[1.4px] text-ar-faint">{s.label}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginTop: 16, gap: 8 }}>
            {atLimit ? (
              <Text className="rounded-2xl border border-ar-line px-3 py-2.5 text-center text-[12px] text-ar-dim">You&apos;ve scanned this {dailyLimit}× today — back after midnight.</Text>
            ) : near ? (
              <ArButton
                variant="primary"
                size="lg"
                icon={ScanLine}
                onPress={() => {
                  onClose();
                  router.push({ pathname: "/murals", params: { target: mural.id } });
                }}
              >
                Scan this mural
              </ArButton>
            ) : (
              <ArButton variant="outline" size="lg" disabled>
                {distance != null ? `Get closer · ${formatDistance(distance)}` : "Turn on location to scan"}
              </ArButton>
            )}
            {!near && (
              <ArButton
                variant="ghost"
                size="md"
                icon={Navigation}
                onPress={() => {
                  onClose();
                  router.push({ pathname: "/directions/[id]", params: { id: mural.id, kind: "mural" } });
                }}
              >
                Directions
              </ArButton>
            )}
          </View>
        </View>
      )}
    </BottomSheet>
  );
}
