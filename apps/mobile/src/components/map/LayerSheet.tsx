import { Check, Layers, MapPin } from "lucide-react-native";
import { createElement, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { BrandAvatar } from "~/components/brand/BrandAvatar";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { Text } from "~/components/ui/Text";
import { useFeedback } from "~/lib/ar/feedback";
import { chipLabels, layerIcon, useMapLayer } from "~/lib/ar/layers";
import type { ArMapLayer } from "~/lib/ar/types";
import { useColors } from "~/theme/theme";

/**
 * The map rail's Layers button and its sheet (docs/layers), as on the web: which drops the map
 * shows. Regular drops, and each brand layer with live drops here (its icon, name and brand),
 * ticked on and off; several at once. Select all / Deselect all. The badge counts layers on.
 */
export function LayerSheetButton({ layers }: { layers: ArMapLayer[] }) {
  const { c } = useColors();
  const { tap } = useFeedback();
  const [open, setOpen] = useState(false);
  const on = useMapLayer((s) => s.view.layers.length);
  return (
    <>
      <Pressable
        onPress={() => {
          tap();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={on ? `Map layers, ${on} on` : "Map layers"}
        className="h-11 w-11 items-center justify-center"
      >
        <Layers size={18} strokeWidth={2.1} color={on ? c("ar-green-hot") : c("ar-text-dim")} />
        {on > 0 && (
          <View
            style={{ position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: c("ar-green-hot") }}
          >
            <Text className="font-hud text-[9px] font-bold" style={{ color: "#000" }}>
              {on}
            </Text>
          </View>
        )}
      </Pressable>
      <LayerSheet open={open} layers={layers} onClose={() => setOpen(false)} />
    </>
  );
}

export function LayerSheet({ open, layers, onClose }: { open: boolean; layers: ArMapLayer[]; onClose: () => void }) {
  const { c } = useColors();
  const view = useMapLayer((s) => s.view);
  const { toggleRegular, toggleLayer, setAll } = useMapLayer.getState();
  const ids = layers.map((l) => l.id);
  const allOn = view.regular && ids.every((id) => view.layers.includes(id));
  const noneOn = !view.regular && !view.layers.length;
  const label = chipLabels(layers);

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View className="px-5 pb-3 pt-1">
        <View className="flex-row items-center gap-2">
          <Text className="font-hud flex-1 text-[16px] font-bold text-ar-text" accessibilityRole="header">
            Map layers
          </Text>
          <Pressable disabled={allOn} onPress={() => setAll(true, ids)} accessibilityRole="button" className="px-2.5 py-1" style={{ opacity: allOn ? 0.4 : 1 }}>
            <Text className="font-hud text-[11px] font-semibold" style={{ color: c("ar-green-hot") }}>
              Select all
            </Text>
          </Pressable>
          <Pressable disabled={noneOn} onPress={() => setAll(false, ids)} accessibilityRole="button" className="px-2.5 py-1" style={{ opacity: noneOn ? 0.4 : 1 }}>
            <Text className="font-hud text-[11px] font-semibold text-ar-dim">Deselect all</Text>
          </Pressable>
        </View>
        <Text className="mt-1 text-[12px] text-ar-dim">Pick what the map and AR show. Turn on as many layers as you like.</Text>

        <ScrollView className="mt-3" style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
          <LayerRow
            on={view.regular}
            onToggle={toggleRegular}
            title="Regular drops"
            subtitle="Drops not in any layer"
            badge={
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c("ar-green", 0.2) }}>
                <MapPin size={17} strokeWidth={2.2} color={c("ar-green-hot")} />
              </View>
            }
          />
          {layers.length > 0 && <Text className="font-hud px-1 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-[2px] text-ar-faint">Brand layers</Text>}
          {layers.map((l) => (
            <LayerRow
              key={l.id}
              on={view.layers.includes(l.id)}
              onToggle={() => toggleLayer(l.id)}
              title={label(l)}
              subtitle={`${l.pinCount} ${l.pinCount === 1 ? "drop" : "drops"} nearby`}
              brand={l.brand}
              brandImage={l.brandImage}
              badge={
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: l.color }}>
                  {createElement(layerIcon(l.icon), { size: 17, strokeWidth: 2.4, color: "#fff" })}
                </View>
              }
            />
          ))}
        </ScrollView>

        {layers.length === 0 && (
          <Text className="px-1 pt-2 text-[12px] text-ar-dim">No brand layers near you right now. When brands group their drops (hospitals, schools, events…), they show up here.</Text>
        )}
        {noneOn && <Text className="px-1 pt-2 text-[12px] text-ar-dim">Nothing is on, so the map shows no drops. Turn on a layer to see them.</Text>}
      </View>
    </BottomSheet>
  );
}

function LayerRow({
  on,
  onToggle,
  title,
  subtitle,
  brand,
  brandImage,
  badge,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  brand?: string;
  brandImage?: string | null;
  badge: ReactNode;
}) {
  const { c } = useColors();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={brand ? `${title} by ${brand}` : title}
      className="flex-row items-center gap-3 rounded-2xl border p-2.5"
      style={{ borderColor: on ? c("ar-green", 0.5) : c("ar-line"), backgroundColor: on ? c("ar-green", 0.1) : c("ar-text", 0.03) }}
    >
      {badge}
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[14px] font-semibold" style={{ color: on ? c("ar-text") : c("ar-text-dim") }}>
          {title}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          {brand && (
            <>
              <BrandAvatar src={brandImage} style={{ width: 16, height: 16, borderRadius: 8 }} />
              <Text numberOfLines={1} className="shrink text-[11.5px] text-ar-dim">
                {brand}
              </Text>
              <Text className="text-[11.5px] text-ar-faint">·</Text>
            </>
          )}
          <Text className="text-[11.5px] text-ar-faint">{subtitle}</Text>
        </View>
      </View>
      <View
        style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center", borderColor: on ? c("ar-green-hot") : c("ar-line-bright"), backgroundColor: on ? c("ar-green-hot") : "transparent" }}
      >
        {on && <Check size={14} strokeWidth={3.2} color="#000" />}
      </View>
    </Pressable>
  );
}
