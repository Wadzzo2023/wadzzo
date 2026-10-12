import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "~/components/ui/Text";
import { thumbUrl } from "~/lib/ar/arTexture";
import { useColors } from "~/theme/theme";

const W = 66;
const H = 58;
const PAD = 4;
const GAP = 3;

/**
 * ── ClusterBillboard ───────────────────────────────────────────────────────
 *
 * A group of nearby drops, drawn as a little roadside billboard: a card on a
 * post with a bento of the brands inside (1 → full panel, 2 → split, 3 → one
 * tall + two stacked, 4 → 2×2), and the drop count on a badge. Tap to zoom in
 * until it opens up into its pins. Anchored at the foot of the post.
 * `tone="mural"`: the same billboard for a group of murals — epic purple,
 * showing their covers.
 */
export const ClusterBillboard = memo(function ClusterBillboard({
  id,
  count,
  images,
  onPress,
  tone = "drop",
}: {
  id: number;
  tone?: "drop" | "mural";
  count: number;
  /** Up to 4 distinct brand images from inside the cluster. */
  images: string[];
  onPress: (id: number) => void;
}) {
  const { c } = useColors();
  const imgs = images.slice(0, 4);
  const mural = tone === "mural";
  const accent = (a?: number) => (mural ? c("rarity-epic", a) : c("ar-green", a));

  return (
    <Pressable
      onPress={() => onPress(id)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${mural ? "murals" : "drops"} here. Zoom in`}
      style={{ width: W + 16, height: H + 26, alignItems: "center" }}
    >
      {/* Ground shadow + post. */}
      <View style={{ position: "absolute", bottom: 0, width: 26, height: 5, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.45)" }} />
      <LinearGradient colors={[accent(0.9), accent(0.25)]} style={{ position: "absolute", bottom: 2, width: 3, height: 18, borderRadius: 2 }} />

      {/* The board. */}
      <View
        style={{
          width: W,
          height: H,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: accent(0.75),
          backgroundColor: c("ar-surface"),
          padding: PAD,
          overflow: "hidden",
        }}
      >
        <Bento images={imgs} />
      </View>

      {/* Count badge on the board's top-right corner. */}
      <View
        style={{
          position: "absolute",
          top: -6,
          right: 1,
          minWidth: 24,
          height: 20,
          paddingHorizontal: 6,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: mural ? c("rarity-epic") : c("ar-green-hot"),
          borderWidth: 2,
          borderColor: c("ar-void"),
        }}
      >
        <Text className="font-hud text-[10.5px] font-bold" style={{ color: mural ? "#fff" : c("ar-void"), fontVariant: ["tabular-nums"] }}>
          {count > 999 ? `${Math.floor(count / 1000)}k` : count}
        </Text>
      </View>
    </Pressable>
  );
});

function Bento({ images }: { images: string[] }) {
  const inner = { w: W - PAD * 2 - 4, h: H - PAD * 2 - 4 }; // minus the 2 px border each side
  const half = { w: (inner.w - GAP) / 2, h: (inner.h - GAP) / 2 };
  const [a, b, c3, d] = images;

  if (images.length <= 1) return <Tile uri={a} w={inner.w} h={inner.h} />;
  if (images.length === 2)
    return (
      <View style={{ flexDirection: "row", gap: GAP }}>
        <Tile uri={a} w={half.w} h={inner.h} />
        <Tile uri={b} w={half.w} h={inner.h} />
      </View>
    );
  if (images.length === 3)
    return (
      <View style={{ flexDirection: "row", gap: GAP }}>
        <Tile uri={a} w={half.w} h={inner.h} />
        <View style={{ gap: GAP }}>
          <Tile uri={b} w={half.w} h={half.h} />
          <Tile uri={c3} w={half.w} h={half.h} />
        </View>
      </View>
    );
  return (
    <View style={{ gap: GAP }}>
      <View style={{ flexDirection: "row", gap: GAP }}>
        <Tile uri={a} w={half.w} h={half.h} />
        <Tile uri={b} w={half.w} h={half.h} />
      </View>
      <View style={{ flexDirection: "row", gap: GAP }}>
        <Tile uri={c3} w={half.w} h={half.h} />
        <Tile uri={d} w={half.w} h={half.h} />
      </View>
    </View>
  );
}

/**
 * `uri` is the brand's original image. The tile asks the server's image
 * optimizer for a 96 px thumbnail first; if that fails (server down, a dev
 * `.env` pointing at a local server that isn't running…) it falls back to
 * the original, so a board is never left blank.
 */
function Tile({ uri, w, h }: { uri?: string; w: number; h: number }) {
  const { c } = useColors();
  const [useOriginal, setUseOriginal] = useState(false);
  const src = uri ? (useOriginal ? uri : thumbUrl(uri)) : undefined;
  return (
    <View style={{ width: w, height: h, borderRadius: 6, overflow: "hidden", backgroundColor: c("ar-surface-3") }}>
      {src ? (
        <Image
          source={{ uri: src }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          recyclingKey={src}
          onError={() => setUseOriginal(true)}
        />
      ) : null}
    </View>
  );
}
