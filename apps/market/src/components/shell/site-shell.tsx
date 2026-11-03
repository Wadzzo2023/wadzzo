import type { ReactNode } from "react";

import { MarketTicker } from "./market-ticker";
import { MobileHeader, MobileTabs } from "./mobile-tabs";
import { SearchDialog } from "./search-dialog";
import { DesktopSidebar } from "./sidebar";

/**
 * No header and no footer on desktop: the green sidebar holds everything (search,
 * wallet, notifications, navigation, account); a market ticker runs across
 * the top of the page. Phones get a green header (logo, notifications,
 * profile, and a Menu that opens the same sidebar as a drawer) and a tab bar.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh">
      <DesktopSidebar />
      <main
        id="main"
        className="min-w-0 flex-1 pt-[env(safe-area-inset-top)] pb-[calc(6rem+var(--safe-bottom))] md:pb-0"
      >
        <MobileHeader />
        <MarketTicker />
        {children}
      </main>
      <MobileTabs />
      <SearchDialog />
    </div>
  );
}
