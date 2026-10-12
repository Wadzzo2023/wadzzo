"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { Toaster } from "@wadzzo/ui/components/toaster";
import { TRPCReactProvider } from "~/trpc/provider";

// The wallet package's global dialogs (connect wallet, toasts). Browser-only.
const WalletPopups = dynamic(() => import("@wadzzo/wallet").then((mod) => mod.ConnectWalletPopups), { ssr: false });

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TRPCReactProvider>
          {children}
          <Toaster />
          <WalletPopups className="font-sans" />
        </TRPCReactProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
