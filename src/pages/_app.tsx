import { SessionProvider } from "next-auth/react";
import { motion } from "framer-motion";
import { type AppType } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";

import "mapbox-gl/dist/mapbox-gl.css";
import "~/styles/globals.css";
// Loaded after globals so the arcade palette wins on equal specificity.
import "~/styles/arcade.css";

// The submodule's own wallet-chooser dialog. Its visibility is driven by its
// own zustand store (`useDialogStore`), which `useAuth().signIn()` opens —
// see the note in lib/ar/store.ts. Mounted once here so it exists regardless
// of which screen triggered the sign-in.
import ConnectDialog from "package/connect_wallet/src/components/connect_dialog";

import { BootSequence } from "~/components/boot/BootSequence";
import { AuthGate } from "~/components/auth/AuthGate";
import { SessionSync } from "~/components/auth/SessionSync";
import { DeviceFrame } from "~/components/shell/DeviceFrame";
import { hasBooted, markBooted } from "~/lib/ar/store";
import { fontVariables } from "~/lib/fonts";
import { api } from "~/utils/api";

const WadzzoAR: AppType = ({ Component, pageProps }) => {
  const router = useRouter();

  // Plays on a cold tab, not on client-side navigation back to the map.
  const [booting, setBooting] = useState(() => !hasBooted());

  return (
    // No `session` prop: every page here is client-rendered (`ssr: false` on
    // the tRPC client too), so there's never a server-hydrated session to
    // pass in — SessionProvider just fetches `/api/auth/session` on mount,
    // which is the one round trip `<SessionSync>` is waiting on anyway.
    <SessionProvider>
      <div className={fontVariables}>
        <Head>
          <title>Wadzzo AR — Collect the real world</title>
          <meta
            name="description"
            content="Find digital collectibles at real places, capture them in AR, and build your collection. No app install required."
          />
          {/* `viewport-fit=cover` is what makes env(safe-area-inset-*) resolve
              to anything but zero on a notched phone. `maximum-scale` stops iOS
              zooming the whole UI when a text field takes focus. */}
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
          />
          <link rel="icon" href="/favicon.ico" />
        </Head>

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
           * mounts, and under React 18 StrictMode (`reactStrictMode: true` in
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
            key={router.pathname}
            className="h-full w-full"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Component {...pageProps} />
          </motion.div>

          <AuthGate />

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
            Its own visibility is a separate zustand store (`useDialogStore`)
            that `useAuth().signIn()` opens; mounted once here, outside
            `DeviceFrame`, because — see the note where AuthGate calls
            `signIn()` — its dialog is not yet constrained to the phone frame
            and currently renders as a normal centred desktop modal. */}
        <ConnectDialog className="" />
      </div>
    </SessionProvider>
  );
};

// Supplies the tRPC client *and* the react-query `QueryClient` the whole tree
// runs on — including the connect_wallet submodule's email/password form,
// which calls plain `useMutation()` and throws without a provider above it.
export default api.withTRPC(WadzzoAR);
