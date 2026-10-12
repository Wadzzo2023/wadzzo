import "mapbox-gl/dist/mapbox-gl.css";
import "~/styles/globals.css";
// Loaded after globals so the arcade palette wins on equal specificity.
import "~/styles/arcade.css";
import "~/styles/platform-theme.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { fontVariables } from "~/lib/fonts";
import { TRPCReactProvider } from "~/trpc/provider";
import { platformBranding } from "@wadzzo/platform/branding";

export const metadata: Metadata = {
  title: `${platformBranding.name} AR — Collect the real world`,
  description:
    "Find digital collectibles at real places, capture them in AR, and build your collection. No app install required.",
  icons: {
    icon: [
      { url: platformBranding.assets.favicon },
      { url: platformBranding.assets.mark, type: "image/png" },
    ],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

// `viewport-fit=cover` is what makes env(safe-area-inset-*) resolve to
// anything but zero on a notched phone. `maximumScale` stops iOS zooming the
// whole UI when a text field takes focus. The theme color matches --ar-void's
// dark value, so browser chrome and any overscroll gutter are the colour the
// app starts on; the boot script below updates it too if it switches to light.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: platformBranding.colors.themeDark,
};

/**
 * Applies the stored theme preference before the page paints.
 *
 * Has to be a literal string, not an import from `lib/ar/theme.ts` — this
 * runs from a raw `<script>` tag, synchronously, before any bundled module
 * (that one included) has loaded. It's read once by the browser and never
 * touched again at runtime, so duplicating `THEME_STORAGE_KEY` and the
 * "auto resolves against matchMedia" logic here is the whole cost; see the
 * doc comment on that file for why there's no way around the duplication.
 *
 * `class="dark"` is already server-rendered on `<html>` below — the only
 * thing this ever needs to do is remove it once, if the resolved theme turns
 * out to be light. Never adds it: dark is already the starting state.
 */
const themeBootScript = `
(function () {
  try {
    var v = localStorage.getItem("wadzzo-ar-theme");
    var pref = v === "light" || v === "dark" ? v : "auto";
    var light =
      pref === "light" ||
      (pref === "auto" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches);
    if (light) {
      document.documentElement.classList.remove("dark");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", platformBranding.colors.themeLight);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `dark` is the server-rendered default — the no-JS-safe fallback, and the
    // starting state the boot script corrects out of if needed. See the big
    // doc comment at the top of arcade.css for the full design. The script
    // changes the class before hydration, hence suppressHydrationWarning.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Runs before body paints — see the comment on `themeBootScript`. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-ar-void">
        <TRPCReactProvider>
          <div className={fontVariables}>{children}</div>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
