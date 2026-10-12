import { motion } from "framer-motion";
import { Wallet } from "lucide-react";

import { GATE_COPY, useAuth } from "~/lib/ar/store";
import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";

/**
 * ── AuthGate ───────────────────────────────────────────────────────────────
 *
 * The app's single read/write boundary. Everything is browsable signed out —
 * the map, every pin, every brand, every public collection. This sheet only
 * appears at the moment someone tries to *change* something: collect, follow,
 * redeem, edit.
 *
 * That ordering is deliberate. Somebody who just scanned a QR code on a table
 * tent has no idea what Wadzzo is yet; asking them to connect a wallet before
 * they've seen a single pin is how you lose them. They see the drop first,
 * decide they want it, and only then meet this.
 *
 * "Connect wallet" below opens the real chooser: `signIn()` (in
 * `lib/ar/store.ts`) just flips the connect_wallet submodule's own
 * `useConnectWalletDialogStore` open, and `<ConnectDialog>` (mounted once in `_app.tsx`)
 * does the rest — Albedo, Freighter, xBull, Rabet, Hana, MetaMask, HOT
 * Wallet, Lobstr, Google, Apple, and email/password all in one dialog.
 * `<SessionSync>` then mirrors the resulting session back into `useAuth`,
 * which is the only thing this sheet — and every screen's `requireAuth()` —
 * actually reads.
 *
 * Known gap: that dialog isn't constrained to the phone frame yet, so it
 * currently opens as an ordinary centred desktop modal rather than something
 * shaped like the rest of this app. Its colours already match — its shadcn
 * primitives use the same CSS custom properties arcade.css repoints — only
 * the layout doesn't yet.
 */

const METHODS = [
  "Albedo",
  "Freighter",
  "xBull",
  "Rabet",
  "Hana",
  "MetaMask",
  "HOT Wallet",
  "Lobstr",
  "Google",
  "Apple",
  "Email",
] as const;

export function AuthGate() {
  const gate = useAuth((s) => s.gate);
  const closeGate = useAuth((s) => s.closeGate);
  const signIn = useAuth((s) => s.signIn);

  const copy = gate ? GATE_COPY[gate] : null;

  return (
    <BottomSheet open={Boolean(gate)} onClose={closeGate} labelledBy="auth-gate-title">
      {copy && (
        <div className="px-6 pt-4 pb-2">
          {/* Emblem */}
          <div className="relative mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center">
            <motion.span
              aria-hidden
              className="border-ar-green/50 absolute inset-0 rounded-full border"
              animate={{ scale: [1, 1.28, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            />
            <span className="ar-key !border-ar-green/50 flex h-[62px] w-[62px] items-center justify-center rounded-full">
              <Wallet
                size={26}
                strokeWidth={2}
                className="text-ar-green-hot drop-shadow-[0_0_10px_hsl(var(--ar-green)/0.9)]"
              />
            </span>
          </div>

          <h2
            id="auth-gate-title"
            className="font-hud text-ar-text text-center text-[21px] leading-tight font-bold"
          >
            {copy.title}
          </h2>
          <p className="text-ar-dim mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-relaxed">
            {copy.body}
          </p>

          <div className="mt-6 space-y-2.5">
            <ArButton variant="primary" size="lg" block icon={Wallet} onClick={signIn}>
              Connect wallet
            </ArButton>
            <ArButton variant="ghost" size="md" block onClick={closeGate}>
              Keep looking around
            </ArButton>
          </div>

          {/* What "connect" actually covers — a wallet-only prompt reads as
              crypto-gated to people who just want a free coffee. */}
          <div className="border-ar-line mt-5 border-t pt-4">
            <p className="font-hud text-ar-faint mb-2.5 text-center text-[9px] font-semibold tracking-[0.24em] uppercase">
              Sign in with
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {METHODS.map((m) => (
                <span
                  key={m}
                  className="font-hud border-ar-line text-ar-faint rounded-full border bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-[0.1em] uppercase"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
