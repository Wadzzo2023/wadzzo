import { useEffect, useId } from "react";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

const ACircle = Animated.createAnimatedComponent(Circle);

/**
 * ── PackArt (mobile) ───────────────────────────────────────────────────────
 *
 * Port of wadzzoAR's generated "Mural Pack" emblem: hex plate, framed paint
 * stroke + drip, spray can, sparkles, progress ring. Pure SVG, no assets.
 */
export function PackArt({ size = 96, progress = 0, done = false, spinning = false }: { size?: number; progress?: number; done?: boolean; spinning?: boolean }) {
  const id = useId().replace(/:/g, "");
  const R = 46;
  const C = 2 * Math.PI * R;
  const spin = useSharedValue(0);
  useEffect(() => {
    if (spinning && !done) spin.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [spinning, done, spin]);
  const spinProps = useAnimatedProps(() => ({ strokeDashoffset: -spin.value * C }));

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={`plate-${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#a35cf0" />
          <Stop offset="1" stopColor="#8c1f99" />
        </LinearGradient>
        <LinearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#38d9f5" />
          <Stop offset="1" stopColor="#b47cf5" />
        </LinearGradient>
      </Defs>
      <Circle cx="50" cy="50" r={R} fill="none" stroke="rgba(130,80,190,0.22)" strokeWidth={4} />
      <Circle
        cx="50"
        cy="50"
        r={R}
        fill="none"
        stroke={done ? "#3ee08f" : `url(#ring-${id})`}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${C} ${C}`}
        strokeDashoffset={done ? 0 : C * (1 - Math.max(0, Math.min(1, progress)))}
        transform="rotate(-90 50 50)"
      />
      {spinning && !done && (
        <ACircle cx="50" cy="50" r={R} fill="none" stroke="#c9a2fa" strokeWidth={4} strokeLinecap="round" strokeDasharray={`${C * 0.12} ${C}`} animatedProps={spinProps} transform="rotate(-90 50 50)" />
      )}
      <Path d="M50 13 L81 31 L81 69 L50 87 L19 69 L19 31 Z" fill={`url(#plate-${id})`} stroke="rgba(214,190,250,0.6)" strokeWidth={1.5} />
      <Path d="M50 18 L77 33.5 L77 66.5 L50 82 L23 66.5 L23 33.5 Z" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <Rect x="32" y="33" width="28" height="22" rx="2.5" fill="rgba(40,20,70,0.55)" stroke="#fff" strokeWidth={2} />
      <Path d="M35 49 C40 41, 45 47, 49 40 S 56 38, 57 44" fill="none" stroke="#4fe3f7" strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M44 55 v5 a1.6 1.6 0 0 0 3.2 0 v-3" fill="#4fe3f7" />
      <Rect x="58" y="47" width="10" height="17" rx="2.5" fill="#f3e8ff" />
      <Rect x="60" y="44" width="6" height="3.5" rx="1" fill="#fff" />
      <Circle cx="56" cy="44.5" r="0.9" fill="#fff" />
      <Circle cx="53.5" cy="43" r="0.7" fill="#fff" opacity={0.8} />
      <Path d="M28 64 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4z" fill="#fff" opacity={0.9} />
      <Path d="M71 28 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z" fill="#fff" opacity={0.75} />
      {done && <Circle cx="50" cy="50" r="40" fill="none" stroke="rgba(62,224,143,0.35)" strokeWidth={6} />}
    </Svg>
  );
}
