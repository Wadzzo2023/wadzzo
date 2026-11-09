import { ChevronRight, Lock, Navigation, Trophy, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { ArButton } from "~/components/ui/ArButton";
import { Glass } from "~/components/ui/surfaces";
import { Text } from "~/components/ui/Text";
import type { ArTrail } from "~/lib/api/types";
import { distanceMeters } from "~/lib/ar/geo";
import { distanceLabel, nextStop, trailColor } from "~/lib/ar/trails";
import type { GeoFix } from "~/lib/ar/types";
import { useColors } from "~/theme/theme";

/**
 * Follow mode's bar on the map (docs/trails): the trail, how far along you
 * are, and the next stop with Go. Finished, it points to the reward. Same
 * content as the web app's TrailFollowBar.
 */
export function TrailFollowBar({
  trail,
  fix,
  onOpen,
  onGo,
  onStop,
}: {
  trail: ArTrail;
  fix: GeoFix | null;
  onOpen: () => void;
  onGo: (pinId: string) => void;
  onStop: () => void;
}) {
  const { c } = useColors();
  const color = trailColor(trail);
  const { done, total, complete } = trail.progress;
  const next = complete ? null : nextStop(trail);
  const away = next && fix ? distanceMeters(fix, next) : null;
  const rewardWaiting = Boolean(trail.reward && !trail.reward.claimed);

  return (
    <Glass className="rounded-ar-lg p-3" style={{ borderRadius: 20 }}>
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
        <Pressable onPress={onOpen} className="min-w-0 flex-1" accessibilityRole="button">
          <Text className="font-hud text-[12px] font-bold uppercase tracking-[1px] text-ar-text" numberOfLines={1}>
            {trail.title}
          </Text>
        </Pressable>
        <Text className="font-hud text-[11px] font-semibold text-ar-dim">
          {done}/{total}
        </Text>
        <Pressable onPress={onStop} hitSlop={10} accessibilityLabel="Stop following this trail">
          <X size={15} color={c("ar-text-dim")} />
        </Pressable>
      </View>
      <View className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: c("ar-text", 0.1) }}>
        <View className="h-full rounded-full" style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }} />
      </View>
      {complete ? (
        <View className="mt-2.5 flex-row items-center" style={{ gap: 8 }}>
          <Trophy size={16} color={c("ar-green-hot")} />
          <Text className="min-w-0 flex-1 text-[12.5px] text-ar-text">
            Trail complete{rewardWaiting ? ": your reward is waiting" : ""}
          </Text>
          <ArButton size="sm" variant="primary" iconRight={ChevronRight} onPress={onOpen}>
            {rewardWaiting ? "Claim" : "Open"}
          </ArButton>
        </View>
      ) : next ? (
        <View className="mt-2.5 flex-row items-center" style={{ gap: 8 }}>
          <View className="min-w-0 flex-1">
            <Text className="text-[10.5px] uppercase tracking-[1.2px] text-ar-faint">
              Next · stop {next.position}
              {away !== null ? ` · ${distanceLabel(away)}` : ""}
            </Text>
            <Text className="text-[13px] font-semibold text-ar-text" numberOfLines={1}>
              {next.title}
            </Text>
            {next.lockReason && (
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Lock size={10} color={c("ar-text-dim")} />
                <Text className="text-[11px] text-ar-dim">{next.lockReason}</Text>
              </View>
            )}
          </View>
          {next.pinId && (
            <ArButton size="sm" icon={Navigation} onPress={() => onGo(next.pinId!)}>
              Go
            </ArButton>
          )}
        </View>
      ) : null}
    </Glass>
  );
}
