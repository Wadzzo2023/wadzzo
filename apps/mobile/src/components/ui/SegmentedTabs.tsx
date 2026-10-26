import type { LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, withSpring } from "react-native-reanimated";

import { cn } from "~/lib/utils";
import { useColors } from "~/theme/theme";

import { Bevel } from "./surfaces";
import { Text } from "./Text";

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

/**
 * Port of the web's SegmentedTabs: one lit pill that *slides* between
 * segments (spring 460/34/0.7, same as the web's shared `layoutId`) rather
 * than each segment swapping its own background.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: SegmentedTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const { c } = useColors();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((t) => t.id === value));
  const segW = tabs.length ? (width - 8 - (tabs.length - 1) * 4) / tabs.length : 0;

  const pill = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: withSpring(index * (segW + 4), { stiffness: 460, damping: 34, mass: 0.7 }) }],
  }));

  return (
    <Bevel className={cn("h-11 rounded-ar", className)} style={{ borderRadius: 16, padding: 4 }}>
      <View
        className="flex-1 flex-row"
        style={{ gap: 4 }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width + 8)}
      >
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              pill,
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: c("ar-green", 0.4),
                backgroundColor: c("ar-green", 0.15),
              },
            ]}
          />
        )}
        {tabs.map((tab) => {
          const active = tab.id === value;
          const Icon = tab.icon;
          const fg = active ? c("ar-green-hot") : c("ar-text-faint");
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className="flex-1 flex-row items-center justify-center"
              style={{ gap: 6 }}
            >
              {Icon && <Icon size={12} strokeWidth={2.4} color={fg} />}
              <Text numberOfLines={1} className="font-hud text-[11px] font-semibold uppercase tracking-[1.1px]" style={{ color: fg }}>
                {tab.label}
              </Text>
              {tab.count != null && (
                <View
                  className="h-[17px] min-w-[19px] items-center justify-center rounded-full px-1"
                  style={{ backgroundColor: active ? c("ar-green-hot", 0.2) : c("ar-text", 0.07) }}
                >
                  <Text className="font-hud text-[9.5px] font-bold" style={{ color: fg, fontVariant: ["tabular-nums"] }}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </Bevel>
  );
}
