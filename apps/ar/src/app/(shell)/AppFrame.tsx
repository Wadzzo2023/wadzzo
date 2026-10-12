"use client";

import { motion } from "framer-motion";
import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

// The submodule's own wallet-chooser dialog. Its visibility is driven by its
// own zustand store (`useConnectWalletDialogStore`), which `useAuth().signIn()` opens —
// see the note in lib/ar/store.ts. Mounted once here so it exists regardless
// of which screen triggered the sign-in.
import { ConnectWalletDialog as ConnectDialog } from "@wadzzo/wallet";

import { AuthGate } from "~/components/auth/AuthGate";
import { SessionSync } from "~/components/auth/SessionSync";
import { BootSequence } from "~/components/boot/BootSequence";
import { MuralPackHud } from "~/components/murals/MuralPackHud";
import { DeviceFrame } from "~/components/shell/DeviceFrame";
import { hasBooted, markBooted } from "~/lib/ar/store";

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Plays on a cold tab, not on client-side navigation back to the map.
  const [booting, setBooting] = useState(() => !hasBooted());

  return (
    // No `session` prop: every screen here is client-rendered, so there's
    // never a server-hydrated session to pass in — SessionProvider just
    // fetches `/api/auth/session` on mount, which is the one round trip
    // `<SessionSync>` is waiting on anyway.
    <SessionProvider>
      {/* Keeps `useAuth().user` in sync with the real session. Lives above
          `DeviceFrame` rather than inside it — it renders nothing, so where
          it sits only matters for making clear it isn't part of the phone
          screen's own tree. */}
      <SessionSync />

      <DeviceFrame>
        {/* Screens fade up on entry rather than cross-fading.
         *
         * There is deliberately no `AnimatePresence` here. With `mode="wait"` the
         * outgoing page has to signal that its exit finished before the incoming one
         * mounts, and under React StrictMode (`reactStrictMode: true` in
         * next.config.js) that callback gets dropped on the double-invoked effect —
         * leaving the old page parked in the DOM at `opacity: 0` and the new one
         * never mounted at all. The symptom is a blank screen on every tab switch
         * until a reload.
         *
         * Keying on `pathname` without a presence wrapper makes React swap the tree
         * immediately and the new screen plays its own enter transition. It also
         * avoids ever having two pages alive at once — which on this app would mean
         * two Mapbox GL contexts and two geolocation watchers during every
         * transition. A tab switch should be instant anyway; only the arrival needs
         * easing. */}
        <motion.div
          key={pathname}
          className="h-full w-full"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {children}
        </motion.div>

        <AuthGate />

        {/* Mural pack: background install + HUD pill + ready toast. */}
        <MuralPackHud />

        {/* No presence wrapper needed: BootSequence has no `exit` prop — it
            plays its own iris-open inside `animate` and then unmounts itself
            via `onDone`. Wrapping it would only add another place for a
            dropped exit callback to strand an overlay on top of the app. */}
        {booting && (
          <BootSequence
            onDone={() => {
              markBooted();
              setBooting(false);
            }}
          />
        )}
      </DeviceFrame>

      {/* The real wallet/email chooser, from the connect_wallet submodule.
          Its own visibility is a separate zustand store (`useConnectWalletDialogStore`)
          that `useAuth().signIn()` opens; mounted once here, outside
          `DeviceFrame`, because its dialog is not constrained to the phone
          frame and renders as a normal centred desktop modal. */}
      <ConnectDialog className="" />
    </SessionProvider>
  );
}
