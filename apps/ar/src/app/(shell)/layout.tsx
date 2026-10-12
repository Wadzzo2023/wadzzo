import { Suspense, type ReactNode } from "react";

import { AppFrame } from "./AppFrame";

/**
 * Everything inside the simulated phone: session, boot sequence, device
 * frame, auth gate. (The Albedo bridge and website embeds live in `(bare)`.)
 * The Suspense boundary is what lets screens read the URL's query string
 * (`useSearchParams`) without opting the whole app out of static rendering.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame>
      <Suspense>{children}</Suspense>
    </AppFrame>
  );
}
