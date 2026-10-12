"use client";

import { useState } from "react";
import QRCode from "react-qr-code";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { Chip } from "~/components/ui/Badges";
import { pinStatus } from "~/lib/ar/rarity";
import { usePinsQuery } from "~/lib/ar/usePins";

/**
 * ── /qr-test ───────────────────────────────────────────────────────────────
 *
 * A bench for the QR flow. Not linked from anywhere in the app and not meant
 * to ship to collectors — it exists so the codes can be tested the way they
 * will actually be used: displayed on one screen and scanned with a different
 * device's camera.
 *
 * Every code here is real. It encodes `/scan?pin=<id>` against the origin the
 * page is served from — the same URL shape `collectByQr` expects — so a
 * successful scan here is a successful scan in production.
 *
 * Two things worth watching while testing:
 *
 *   - Scanning with the *phone's own camera app* is the primary journey. It
 *     opens `/scan?pin=<id>`, which claims immediately without ever asking for
 *     the camera. The in-app scanner at `/scan` is the secondary one.
 *   - A pin's status is printed under each code, because most failures are not
 *     scanner failures. A locked drop answers "Follow this brand to unlock"
 *     and an already-collected one answers "You've already collected this
 *     one" — both correct, and both easy to mistake for a broken scan.
 */
export default function QrTestScreen() {
  const { pins, isLoading } = usePinsQuery();
  const [onlyClaimable, setOnlyClaimable] = useState(true);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const shown = onlyClaimable ? pins.filter((p) => pinStatus(p) === "collectible") : pins;

  return (
    <AppShell>
      <div className="ar-scroll h-full">
        <ScreenHeader eyebrow="Developer bench" title="QR test" />

        <div className="px-5">
          <p className="text-ar-dim text-[12.5px] leading-relaxed">
            Scan any code below with another device. Each one encodes{" "}
            <code className="rounded-base text-ar-text bg-white/[0.06] px-1">
              /scan?pin=&lt;id&gt;
            </code>{" "}
            — the same string a creator shares.
          </p>

          <div className="mt-3 flex gap-1.5">
            <Chip active={onlyClaimable} onClick={() => setOnlyClaimable(true)}>
              Claimable {shown.length > 0 && `· ${shown.length}`}
            </Chip>
            <Chip active={!onlyClaimable} onClick={() => setOnlyClaimable(false)}>
              All · {pins.length}
            </Chip>
          </div>
        </div>

        {isLoading ? (
          <p className="text-ar-faint px-5 py-10 text-center text-[12.5px]">Loading pins…</p>
        ) : shown.length === 0 ? (
          <p className="text-ar-faint px-5 py-10 text-center text-[12.5px]">
            No pins match. Try “All”.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 px-5 pb-10 sm:grid-cols-2">
            {shown.map((pin) => {
              const status = pinStatus(pin);
              const url = `${origin}/scan?pin=${pin.id}`;
              return (
                <div key={pin.id} className="ar-bevel rounded-ar-lg p-3.5">
                  <div className="rounded-ar mx-auto w-fit bg-white p-2.5">
                    <QRCode value={url} size={150} bgColor="#ffffff" fgColor="#07120c" level="H" />
                  </div>

                  <p className="font-hud text-ar-text mt-2.5 truncate text-[12px] font-bold">
                    {pin.title}
                  </p>
                  <p className="text-ar-faint mt-0.5 truncate text-[11px]">{pin.brandName}</p>

                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={
                        status === "collectible"
                          ? "font-hud text-ar-green-hot text-[10px] font-bold tracking-[0.1em] uppercase"
                          : "font-hud text-ar-faint text-[10px] font-bold tracking-[0.1em] uppercase"
                      }
                    >
                      {status}
                    </span>
                    {pin.locked && pin.lockReason && (
                      <span className="text-ar-faint truncate text-[10px]">· {pin.lockReason}</span>
                    )}
                  </div>

                  {/* The id in full, so a failing scan can be reproduced by
                      hand against the endpoint without reading it off a QR. */}
                  <p className="text-ar-faint mt-2 font-mono text-[9.5px] leading-snug break-all">
                    {pin.id}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
