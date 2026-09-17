import { Check, Copy, Download, QrCode } from "lucide-react";
import { useRef, useState } from "react";
import QRCode from "react-qr-code";

import { ArButton } from "~/components/ui/ArButton";

/**
 * ── PinQrCode ──────────────────────────────────────────────────────────────
 *
 * A drop's shareable code: the thing a creator prints for a table tent, a
 * window, or the side of a stall.
 *
 * It encodes a full URL rather than a bare id, because the code that matters
 * is the one scanned by a *phone's own camera app*, not by this screen — and
 * that only knows what to do with a link. `/scan?pin=<id>` opens the app and
 * claims immediately; the in-app scanner reads the same URL and takes the
 * short path.
 *
 * Export is a PNG rather than the SVG `react-qr-code` renders, because the
 * destination is a printer or a chat app and neither reliably takes an SVG.
 * The quiet zone matters: a QR with no white margin fails to scan against a
 * dark surface, so the canvas is padded rather than drawn edge to edge.
 */
const QUIET_ZONE_PX = 24;
const EXPORT_SIZE_PX = 1024;

export function PinQrCode({
  pinId,
  title,
}: {
  pinId: string;
  /** Used for the download filename, so a creator with twenty codes can tell them apart. */
  title: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<"link" | "image" | null>(null);
  const [busy, setBusy] = useState(false);

  // `window` is not available while this renders on the server; the value is
  // only read inside handlers and the QR body, both client-side.
  const shareUrl =
    typeof window === "undefined"
      ? `/scan?pin=${pinId}`
      : `${window.location.origin}/scan?pin=${pinId}`;

  /** Rasterise the rendered SVG onto a padded white canvas. */
  const toCanvas = async (): Promise<HTMLCanvasElement | null> => {
    const svg = wrapRef.current?.querySelector("svg");
    if (!svg) return null;

    const source = new XMLSerializer().serializeToString(svg);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;

    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = svgUrl;
    });
    if (!img) return null;

    const canvas = document.createElement("canvas");
    const inner = EXPORT_SIZE_PX - QUIET_ZONE_PX * 2;
    canvas.width = EXPORT_SIZE_PX;
    canvas.height = EXPORT_SIZE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, QUIET_ZONE_PX, QUIET_ZONE_PX, inner, inner);
    return canvas;
  };

  const download = async () => {
    setBusy(true);
    try {
      const canvas = await toCanvas();
      if (!canvas) return;
      const a = document.createElement("a");
      const slug =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || "drop";
      a.download = `wadzzo-${slug}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const flash = (what: "link" | "image") => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("link");
    } catch {
      /* clipboard blocked — the code itself is still on screen */
    }
  };

  const copyImage = async () => {
    setBusy(true);
    try {
      const canvas = await toCanvas();
      if (!canvas) return;
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob((b) => r(b), "image/png"),
      );
      // Not every browser exposes `ClipboardItem`; falling back to the link
      // beats a button that silently does nothing.
      if (!blob || typeof ClipboardItem === "undefined") {
        await copyLink();
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      flash("image");
    } catch {
      await copyLink();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ar-bevel rounded-ar-lg p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ar-green/50 bg-ar-green/14 text-ar-green-hot">
          <QrCode size={14} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <p className="font-hud text-[11px] font-bold uppercase tracking-[0.14em] text-ar-text">
            Share this drop
          </p>
          <p className="text-[11px] leading-relaxed text-ar-faint">
            Anyone who scans this collects it — no walking required.
          </p>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="mx-auto mt-3.5 w-fit rounded-ar bg-white p-3"
      >
        <QRCode
          value={shareUrl}
          size={148}
          bgColor="#ffffff"
          fgColor="#07120c"
          // High correction, because these get printed and then rained on,
          // taped over a fold, or photographed at an angle.
          level="H"
        />
      </div>

      <div className="mt-3.5 flex gap-2">
        <ArButton
          variant="outline"
          size="sm"
          className="flex-1"
          busy={busy}
          icon={Download}
          onClick={() => void download()}
        >
          PNG
        </ArButton>
        <ArButton
          variant="outline"
          size="sm"
          className="flex-1"
          icon={copied === "image" ? Check : Copy}
          onClick={() => void copyImage()}
        >
          {copied === "image" ? "Copied" : "Image"}
        </ArButton>
        <ArButton
          variant="outline"
          size="sm"
          className="flex-1"
          icon={copied === "link" ? Check : Copy}
          onClick={() => void copyLink()}
        >
          {copied === "link" ? "Copied" : "Link"}
        </ArButton>
      </div>
    </div>
  );
}
