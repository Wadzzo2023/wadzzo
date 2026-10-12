import { Canvas, Picture, Skia, createPicture, type SkPicture } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { StyleSheet, type LayoutChangeEvent, View } from "react-native";
import { useFrameCallback, useReducedMotion, useSharedValue } from "react-native-reanimated";

import type { Rarity } from "~/lib/ar/types";

/** Same palettes as the web (confetti follows the card's rarity). */
const PALETTES: Record<Rarity, string[]> = {
  common: ["#8FA39A", "#B8C9C0", "#5E6E66", "#E6EFE9"],
  rare: ["#35D7F2", "#7BE9FF", "#1B9CB8", "#E8FCFF"],
  epic: ["#A855F7", "#C99BFF", "#6D28D9", "#F3E8FF"],
  legendary: ["#F5B70A", "#FFD75E", "#B87503", "#FFF4D1"],
  mythic: ["#F472B6", "#F5B70A", "#4BE03A", "#35D7F2", "#A855F7", "#FFFFFF"],
};

type P = { x: number; y: number; vx: number; vy: number; w: number; h: number; spin: number; spinRate: number; color: string; life: number; dot: boolean };

const EMPTY = createPicture(() => undefined);

/**
 * Port of the web's Confetti: a burst from an origin, biased up and out (a
 * cone), gravity 0.34, air drag 0.987, flat rects spun about their axis so
 * they tumble edge-on, ~22% dots. Physics runs on the UI thread and paints
 * a Skia picture each frame; the loop stops once every particle is gone.
 */
export function Confetti({ trigger, rarity = "legendary", origin = { x: 0.5, y: 0.42 }, count = 90 }: { trigger: number; rarity?: Rarity; origin?: { x: number; y: number }; count?: number }) {
  const reduced = useReducedMotion();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const particles = useSharedValue<P[]>([]);
  const picture = useSharedValue<SkPicture>(EMPTY);

  const frame = useFrameCallback(() => {
    "worklet";
    const list = particles.value;
    if (!list.length) return;
    const next: P[] = [];
    const rec = Skia.PictureRecorder();
    const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, size.w, size.h));
    const paint = Skia.Paint();
    for (const p of list) {
      p.vy += 0.34;
      p.vx *= 0.987;
      p.vy *= 0.987;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += p.spinRate;
      p.life -= 0.006;
      if (p.life <= 0 || p.y > size.h + 40) continue;
      paint.setColor(Skia.Color(p.color));
      paint.setAlphaf(Math.max(0, Math.min(1, p.life * 1.6)));
      canvas.save();
      canvas.translate(p.x, p.y);
      canvas.rotate((p.spin * 180) / Math.PI, 0, 0);
      if (p.dot) canvas.drawCircle(0, 0, p.w / 2.4, paint);
      else {
        const w = Math.max(1, p.w * Math.abs(Math.cos(p.spin * 1.7)));
        canvas.drawRect(Skia.XYWHRect(-w / 2, -p.h / 2, w, p.h), paint);
      }
      canvas.restore();
      next.push(p);
    }
    picture.value = rec.finishRecordingAsPicture();
    particles.value = next;
  }, false);

  useEffect(() => {
    if (trigger <= 0 || reduced || !size.w) return;
    const palette = PALETTES[rarity];
    const ox = size.w * origin.x;
    const oy = size.h * origin.y;
    particles.value = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
      const speed = 5 + Math.random() * 11;
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed * (0.75 + Math.random() * 0.7),
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 7,
        h: 7 + Math.random() * 9,
        spin: Math.random() * Math.PI * 2,
        spinRate: (Math.random() - 0.5) * 0.4,
        color: palette[Math.floor(Math.random() * palette.length)]!,
        life: 1,
        dot: Math.random() > 0.78,
      };
    });
    frame.setActive(true);
    const stop = setTimeout(() => frame.setActive(false), 6000);
    return () => clearTimeout(stop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 70 }]} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}
