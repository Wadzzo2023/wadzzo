"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { DialogProfileSync } from "~/components/shell/dialog-profile-sync";
import { TRPCReactProvider } from "~/trpc/provider";

// The wallet package's global dialogs (connect wallet, toasts). Browser-only.
const WalletPopups = dynamic(
  () => import("@wadzzo/wallet").then((mod) => mod.ConnectWalletPopups),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        themes={["light", "dark", "contrast"]}
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <TRPCReactProvider>
          {children}
          <WalletPopups className="font-sans" />
          <DialogProfileSync />
        </TRPCReactProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
