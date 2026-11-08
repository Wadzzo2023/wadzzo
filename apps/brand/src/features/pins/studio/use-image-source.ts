import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { traceImage } from "@wadzzo/schemas/shape-geometry";

import { imagePixels } from "./image-utils";

/** Where an image to turn into an outline came from. */
export type SourceKind = "trace" | "ai" | "enhance";

export type ImageSourceState = ReturnType<typeof useImageSource>;

/**
 * An image waiting to become an outline (an upload to trace, or an AI result)
 * with the settings that decide how it is traced. `traced` is the outline it
 * would make right now.
 */
export function useImageSource() {
  const [source, setSource] = useState<{ url: string; data: ImageData; from: SourceKind } | null>(
    null,
  );
  const [threshold, setThreshold] = useState(160);
  const [detail, setDetail] = useState(0.55);
  const [invert, setInvert] = useState(false);
  /** The brand confirms it may use an uploaded image. */
  const [rights, setRights] = useState(false);

  const traced = useMemo(
    () =>
      source
        ? traceImage(source.data.data, source.data.width, source.data.height, {
            threshold,
            detail,
            invert,
          })
        : null,
    [source, threshold, detail, invert],
  );

  const load = async (url: string, from: SourceKind) => {
    try {
      const data = await imagePixels(url);
      if (!data) {
        toast.error("Your browser couldn't read that image");
        return;
      }
      setSource({ url, data, from });
      // AI pictures are black on white: no need to invert, and a middling threshold fits.
      if (from !== "trace") {
        setInvert(false);
        setThreshold(128);
      }
    } catch {
      toast.error("That image couldn't be read");
    }
  };

  const clear = () => setSource(null);
  const reset = () => {
    setSource(null);
    setRights(false);
  };

  return {
    source,
    traced,
    threshold,
    setThreshold,
    detail,
    setDetail,
    invert,
    setInvert,
    rights,
    setRights,
    load,
    clear,
    reset,
  };
}
