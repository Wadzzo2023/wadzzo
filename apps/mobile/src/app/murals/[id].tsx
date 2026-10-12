import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Coins, Navigation, PencilLine, ScanLine, ShieldX, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NameMuralSheet } from "~/components/murals/NameMuralSheet";
import { ScreenHeader } from "~/components/shell/ScreenHeader";
import { ArButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { Text } from "~/components/ui/Text";
import { useMural } from "~/lib/murals/api";
import type { MuralStatus } from "~/lib/murals/constants";
import { useColors } from "~/theme/theme";

/**
 * ── /murals/[id] ───────────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's mural detail: the viewer's own latest photo, the
 * Found → In review → Verified timeline, their numbers, directions, scan
 * history with their own keyframes.
 */

const STEPS: { key: MuralStatus; label: string }[] = [
  { key: "DISCOVERED", label: "Found" },
  { key: "PENDING", label: "In review" },
  { key: "APPROVED", label: "Verified" },
];
const ORDER: Record<MuralStatus, number> = { DISCOVERED: 0, PENDING: 1, APPROVED: 2, REJECTED: -1 };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function MuralDetailScreen() {
  const { c } = useColors();
  const insets = useSafeAreaInsets();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const q = useMural(id);
  const [naming, setNaming] = useState(false);
  const mural = q.data?.mural;
  const mine = q.data?.mine;
  const photo = mine?.history[0]?.keyframes[1] ?? mural?.coverUrl;
  const step = mural ? ORDER[mural.status] : 0;
  const gold = c("rarity-legendary");

  return (
    <View style={{ flex: 1 }} className="bg-ar-bg">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <ScreenHeader back eyebrow="Mural" title={mural?.title ?? "Mural"} />
        {q.isLoading ? (
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <Skeleton style={{ aspectRatio: 4 / 5, borderRadius: 22 }} />
            <Skeleton style={{ height: 64, borderRadius: 16 }} />
          </View>
        ) : !mural ? (
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <ShieldX size={28} color={c("ar-text-faint")} />
            <Text className="font-hud mt-3 text-[15px] font-bold text-ar-text">This mural isn&apos;t available</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 16 }}>
            <View style={{ borderRadius: 22, borderWidth: 2, borderColor: c("rarity-epic", 0.7), overflow: "hidden", opacity: mural.status === "REJECTED" ? 0.6 : 1 }}>
              <Image source={{ uri: photo }} style={{ aspectRatio: 4 / 5 }} contentFit="cover" />
              {mine?.rank != null && (
                <View style={{ position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "rgba(10,18,14,0.8)", paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Sparkles size={11} strokeWidth={2.6} color={c("rarity-epic")} />
                  <Text className="font-hud text-[10px] font-bold uppercase tracking-[1.6px] text-rarity-epic">{mine.rank === 1 ? "You discovered it" : `Finder #${mine.rank}`}</Text>
                </View>
              )}
            </View>

            <View>
              <Text className="text-[13px] text-ar-dim">{mural.artist ? `by ${mural.artist}` : mural.autoTitled ? "Not named yet" : "Artist unknown"}</Text>
              {mine?.canName && (
                <View style={{ alignSelf: "flex-start", marginTop: 8 }}>
                  <ArButton size="sm" icon={PencilLine} onPress={() => setNaming(true)}>
                    Name this mural
                  </ArButton>
                </View>
              )}
            </View>

            {mural.status === "REJECTED" ? (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c("ar-danger", 0.4), backgroundColor: c("ar-danger", 0.1), padding: 14 }}>
                <Text className="text-[12.5px] text-ar-text">Not collectable — reviewers decided this isn&apos;t a mural. You keep the coins you earned.</Text>
              </View>
            ) : (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c("ar-line"), padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {STEPS.map((s, i) => {
                    const done = i <= step;
                    return (
                      <View key={s.key} style={{ flexDirection: "row", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : 0 }}>
                        <View style={{ alignItems: "center" }}>
                          <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: done ? c("rarity-epic") : c("ar-line"), backgroundColor: done ? c("rarity-epic") : "transparent", alignItems: "center", justifyContent: "center" }}>
                            {done && <Check size={12} strokeWidth={3} color="#fff" />}
                          </View>
                          <Text className="font-hud mt-1 text-[9.5px] font-bold uppercase tracking-[1.2px]" style={{ color: done ? c("ar-text") : c("ar-text-faint") }}>
                            {s.label}
                          </Text>
                        </View>
                        {i < STEPS.length - 1 && <View style={{ flex: 1, height: 2, marginHorizontal: 4, marginBottom: 16, backgroundColor: i < step ? c("rarity-epic") : c("ar-line") }} />}
                      </View>
                    );
                  })}
                </View>
                {mural.status === "DISCOVERED" && (
                  <Text className="mt-2.5 text-center text-[11.5px] text-ar-dim">
                    {mural.distinctScanners} of {mural.confirmationsNeeded} finders — it goes to review after that.
                  </Text>
                )}
              </View>
            )}

            {mine && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  { label: "Today", value: `${mine.scansToday}/${mine.dailyLimit}` },
                  { label: "Your scans", value: String(mine.totalScans) },
                  { label: "Coins", value: mine.coinsEarned.toLocaleString(), gold: true },
                ].map((s) => (
                  <View key={s.label} style={{ flex: 1, alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: c("ar-line"), paddingVertical: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {s.gold && <Coins size={13} strokeWidth={2.5} color={gold} />}
                      <Text className="font-hud text-[16px] font-bold" style={{ color: s.gold ? gold : c("ar-text") }}>
                        {s.value}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-[9.5px] uppercase tracking-[1.4px] text-ar-faint">{s.label}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={{ gap: 8 }}>
              {mural.status !== "REJECTED" && (
                <ArButton variant="primary" size="lg" icon={ScanLine} onPress={() => router.push({ pathname: "/murals", params: { target: mural.id } })}>
                  Scan it again
                </ArButton>
              )}
              <ArButton
                variant="ghost"
                size="md"
                icon={Navigation}
                onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${mural.latitude},${mural.longitude}&travelmode=walking`)}
              >
                Directions
              </ArButton>
            </View>

            {mine && mine.history.length > 0 && (
              <View>
                <Text className="font-hud mb-2 text-[11px] font-bold uppercase tracking-[1.6px] text-ar-dim">Your scans</Text>
                <View style={{ gap: 8 }}>
                  {mine.history.map((h) => (
                    <View key={h.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderColor: c("ar-line"), padding: 8 }}>
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        {h.keyframes.map((k) => (
                          <Image key={k} source={{ uri: k }} style={{ width: 36, height: 44, borderRadius: 6 }} contentFit="cover" />
                        ))}
                      </View>
                      <Text className="flex-1 text-[12.5px] text-ar-text">{when(h.createdAt)}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Coins size={12} strokeWidth={2.6} color={gold} />
                        <Text className="font-hud text-[13px] font-bold" style={{ color: gold }}>
                          +{h.coinsAwarded}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {!mine && (
              <Pressable onPress={() => router.push("/auth/sign-in")}>
                <Text className="text-center text-[12px] text-ar-faint">Sign in to see your scans of this mural.</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
      {mural && <NameMuralSheet key={naming ? "open" : "closed"} muralId={mural.id} autoTitle={mural.title} open={naming} onClose={() => setNaming(false)} />}
    </View>
  );
}
