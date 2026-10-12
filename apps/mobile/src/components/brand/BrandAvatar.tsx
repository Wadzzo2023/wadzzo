import { Image, type ImageStyle } from "expo-image";
import { useState } from "react";
import type { StyleProp } from "react-native";

const FALLBACK = require("../../../assets/brand/wadzzo-mark.png");

/**
 * Port of the web's BrandAvatar: a brand's image, degrading to the local
 * Wadzzo mark when the URL doesn't resolve (some creators' images sit on the
 * rate-limited public ipfs.io gateway and 429/403 permanently).
 */
export function BrandAvatar({
  src,
  className,
  style,
}: {
  src: string | null | undefined;
  className?: string;
  style?: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Image
      source={!src || failed ? FALLBACK : { uri: src }}
      onError={() => setFailed(true)}
      contentFit="cover"
      transition={150}
      className={className}
      style={style}
      accessibilityIgnoresInvertColors
    />
  );
}
