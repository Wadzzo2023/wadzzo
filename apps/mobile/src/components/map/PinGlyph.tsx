import { memo, useId, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { ClipPath, Defs, Image as SvgImage, Path } from "react-native-svg";

/**
 * Native twin of the web's PinGlyph (packages/ui/src/patterns/pin-glyph.tsx):
 * the brand's outline (100×100 box, checked by the server), the image
 * clipped inside it or a solid colour, and an outline in the state colour.
 * (react-native-svg reports no image errors: an image that fails to load
 * leaves the shape's `under` colour showing, which still reads as a pin.)
 */

/** The default outline, for pins sent without a look (older servers). */
export const DEFAULT_PIN_PATH = "M50 4 A46 46 0 1 1 49.99 4 Z";

export const PinGlyph = memo(function PinGlyph({
  path,
  size = 42,
  fill,
  under = "#ffffff",
  imageUrl,
  imageFit,
  ringColor,
  ringWidth = 2,
  imageOpacity = 1,
  placeholder,
}: {
  path: string;
  size?: number;
  /** Solid colour when there's no image. */
  fill: string;
  /** What shows under a loading / see-through image. */
  under?: string;
  imageUrl?: string | null;
  imageFit?: { zoom: number; x: number; y: number } | null;
  ringColor: string;
  ringWidth?: number;
  imageOpacity?: number;
  /** Centred over the solid fill when there's no image (e.g. the brand's initial). */
  placeholder?: ReactNode;
}) {
  const clipId = `pg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const showImage = Boolean(imageUrl);

  const zoom = Math.max(1, Math.min(4, imageFit?.zoom ?? 1));
  const room = (zoom - 1) * 50;
  const ix = 50 - 50 * zoom + Math.max(-1, Math.min(1, imageFit?.x ?? 0)) * room;
  const iy = 50 - 50 * zoom + Math.max(-1, Math.min(1, imageFit?.y ?? 0)) * room;
  // The ring is drawn in box units; keep it about `ringWidth` px whatever the size.
  const stroke = (ringWidth * 100) / size;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={path} />
          </ClipPath>
        </Defs>
        <Path d={path} fill={showImage ? under : fill} />
        {showImage && (
          <SvgImage
            href={{ uri: imageUrl! }}
            x={ix}
            y={iy}
            width={100 * zoom}
            height={100 * zoom}
            opacity={imageOpacity}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        )}
        <Path d={path} fill="none" stroke={ringColor} strokeWidth={stroke} strokeLinejoin="round" />
      </Svg>
      {!showImage && placeholder ? (
        <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
          {placeholder}
        </View>
      ) : null}
    </View>
  );
});
