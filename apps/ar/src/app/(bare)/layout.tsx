import { Suspense, type ReactNode } from "react";

/**
 * Screens that live outside the phone frame (the Albedo bridge, website
 * embeds). The Suspense boundary lets them read the URL's query string
 * (`useSearchParams`) without opting the whole app out of static rendering.
 */
export default function BareLayout({ children }: { children: ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
