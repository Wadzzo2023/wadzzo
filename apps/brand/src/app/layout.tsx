import "mapbox-gl/dist/mapbox-gl.css";
import "react-quill-new/dist/quill.snow.css";
import "~/styles/globals.css";
import "~/styles/platform-theme.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import { platformBranding } from "@wadzzo/platform/branding";

export const metadata: Metadata = {
  title: {
    default: `${platformBranding.name} Brand Portal`,
    template: `%s · ${platformBranding.name} Brand Portal`,
  },
  description: `Create and manage your drops, stores, posts, bounties and events on ${platformBranding.name}.`,
  icons: { icon: platformBranding.assets.favicon },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: platformBranding.colors.portalThemeLight,
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: platformBranding.colors.portalThemeDark,
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the class before hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
