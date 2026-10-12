"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import { useState, type ReactNode } from "react";
import superjson from "superjson";

import { api } from "~/utils/api";

/**
 * The query client and tRPC client for the whole app (App Router). Created
 * once per browser session with useState — never at module scope, so a server
 * render can't share a cache between requests. Also supplies the
 * `QueryClient` the connect_wallet submodule's email/password form needs
 * (it calls plain `useMutation()` and throws without a provider above it).
 */
export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" &&
            op.direction === "down" &&
            op.result instanceof Error,
        }),
        httpBatchLink({ url: "/api/trpc", transformer: superjson }),
      ],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
