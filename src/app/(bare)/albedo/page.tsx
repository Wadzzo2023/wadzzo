"use client";

import albedo from "@albedo-link/intent";
import { Loader2, Wallet } from "lucide-react";
import { useQueryParams } from "~/lib/navigation";
import { useEffect, useRef, useState } from "react";

import { env } from "~/env";

/**
 * ── /albedo ────────────────────────────────────────────────────────────────
 *
 * The bridge the native app (wadzzoAR-mobile) opens in a WebView to use the
 * Albedo wallet, ported from wadzz0's `/albedo`:
 *
 *   /albedo?token=<random>  → `albedo.publicKey` → posts `{ type: "token", res }`
 *   /albedo?xdr=<xdr>       → `albedo.tx`        → posts `{ type: "xdr", res }`
 *
 * Results go back through `window.ReactNativeWebView.postMessage`. Rendered
 * bare by `_app.tsx` — no device frame or boot sequence.
 *
 * Albedo normally opens a popup, which a WebView can't host, so `window.open`
 * is redirected into a full-screen iframe (the same trick the reference uses).
 * Unlike the reference, the transaction is signed for the network this
 * deployment actually runs on, not always mainnet.
 */

type Bridge = { postMessage: (msg: string) => void };

function post(message: unknown) {
  (window as unknown as { ReactNativeWebView?: Bridge }).ReactNativeWebView?.postMessage(
    JSON.stringify(message),
  );
}

export default function AlbedoBridge() {
  const { query, ready: isReady } = useQueryParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameHost = useRef<HTMLDivElement>(null);

  const token = typeof query.token === "string" ? query.token : null;
  const xdr = typeof query.xdr === "string" ? query.xdr : null;

  useEffect(() => {
    const original = window.open;
    window.open = ((url?: string | URL) => {
      const host = frameHost.current;
      if (!host || !url) return null;
      host.innerHTML = "";
      host.style.display = "flex";
      const iframe = document.createElement("iframe");
      iframe.src = String(url);
      iframe.style.cssText = "width:100%;height:100%;border:0;background:#fff";
      host.appendChild(iframe);
      return iframe.contentWindow;
    }) as typeof window.open;
    return () => {
      window.open = original;
    };
  }, []);

  const hideFrame = () => {
    if (frameHost.current) {
      frameHost.current.style.display = "none";
      frameHost.current.innerHTML = "";
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (token) {
        const res = await albedo.publicKey({ token });
        post({ type: "token", res });
      } else if (xdr) {
        const res = await albedo.tx({
          xdr,
          network: env.NEXT_PUBLIC_STELLAR_PUBNET ? "public" : "testnet",
        });
        post({ type: "xdr", res });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Albedo was closed";
      setError(message);
      post({ type: "error", message });
    } finally {
      hideFrame();
      setBusy(false);
    }
  };

  const valid = isReady && (token ?? xdr);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ar-bg px-8 text-center"
      style={{ fontFamily: "var(--nf-body)" }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-ar-green/40 bg-ar-green/15 text-ar-green-hot">
        <Wallet size={24} strokeWidth={2.2} />
      </span>
      <div>
        <h1 className="font-hud text-[20px] font-bold text-ar-text">
          {xdr ? "Approve in Albedo" : "Sign in with Albedo"}
        </h1>
        <p className="mx-auto mt-2 max-w-[18rem] text-[13px] leading-relaxed text-ar-dim">
          {xdr
            ? "Albedo will show the transaction. Approve it to finish following this brand."
            : "Albedo will ask you to confirm it's your wallet. Nothing is sent or spent."}
        </p>
      </div>
      {valid ? (
        <button
          onClick={() => void run()}
          disabled={busy}
          className="ar-key ar-key-primary font-hud flex h-[54px] w-full max-w-[20rem] items-center justify-center gap-2 rounded-ar-lg text-[15px] font-semibold uppercase tracking-[0.08em] disabled:opacity-60"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : null}
          {busy ? "Waiting for Albedo" : "Continue"}
        </button>
      ) : (
        <p className="text-[12px] text-ar-faint">Nothing to sign.</p>
      )}
      {error && <p className="text-[12px] text-ar-danger">{error}</p>}

      <div
        ref={frameHost}
        className="fixed inset-0 z-50 hidden items-stretch justify-stretch bg-black/80"
      />
    </div>
  );
}
