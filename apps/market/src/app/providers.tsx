"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { TRPCReactProvider } from "~/trpc/provider";

// connect_wallet's global dialogs (sign-in, wallet connect) and the toast container. Browser-only.
const WalletPopups = dynamic(
  () => import("@wadzzo/wallet").then((mod) => mod.ConnectWalletPopups),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        storageKey="wadzzo-theme"
        disableTransitionOnChange
      >
        <TRPCReactProvider>
          {children}
          <WalletPopups className="font-sans" />
        </TRPCReactProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
