import { Suspense, type ReactNode } from "react";

import { SharedThemeSync } from "~/components/shell/SharedThemeSync";

import { AppFrame } from "./AppFrame";

/**
 * Everything inside the simulated phone: session, boot sequence, device
 * frame, auth gate, and the theme shared with the other Wadzzo sites. (The
 * Albedo bridge and website embeds live in `(bare)`; embeds keep their own theme.)
 * The Suspense boundary is what lets screens read the URL's query string
 * (`useSearchParams`) without opting the whole app out of static rendering.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame>
      <SharedThemeSync />
      <Suspense>{children}</Suspense>
    </AppFrame>
  );
}
