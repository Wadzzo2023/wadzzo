/**
 * Minimal JSX typing for Google's `<model-viewer>` custom element
 * (https://modelviewer.dev), loaded at runtime from a CDN script — see
 * `~/components/ar/ArPhotoFrame.tsx`. Scoped to the attributes and
 * imperative surface that component actually uses, not the library's full
 * API — it drives AR entirely through `activateAR()` rather than the
 * element's own visible canvas or slotted button.
 */
import type { DetailedHTMLProps, HTMLAttributes } from "react";

export interface ModelViewerElement extends HTMLElement {
  /**
   * Opens the platform's native AR placement (WebXR hit-test, Scene Viewer,
   * or Quick Look) for the currently-loaded `src`. Rejects if this device
   * or browser can't do AR at all.
   */
  activateAR: () => Promise<void>;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<
        HTMLAttributes<ModelViewerElement> & {
          src?: string;
          ar?: boolean;
          "ar-modes"?: string;
        },
        ModelViewerElement
      >;
    }
  }
}
