import { AnimatePresence, motion } from "framer-motion";
import { Frame, X } from "lucide-react";
import { useRouter } from "~/lib/navigation";
import { useEffect, useRef, useState } from "react";

import { BottomSheet } from "~/components/ui/BottomSheet";
import { startMuralPack, useMuralPack, usePackSheet } from "~/lib/murals/pack";
import { sfx } from "~/lib/murals/sfx";

import { PackArt } from "./PackArt";
import { PackPanel } from "./PackPanel";
import { platformBranding } from "@wadzzo/platform/branding";

/** Pages that must never pull 23 MB: brand-site embeds and dev tools. */
const NO_DOWNLOAD = ["/embed", "/dev"];

/**
 * ── MuralPackHud ───────────────────────────────────────────────────────────
 *
 * Mounted once in `_app`. Starts the mural pack download as the app opens,
 * resumes it whenever the connection comes back, and hosts the game-style
 * panel (opened from the % badge on the AR button's ring — `PackRing`).
 * When it finishes: a "Mural pack ready" toast with a shortcut + fanfare.
 */
export function MuralPackHud() {
  const router = useRouter();
  const s = useMuralPack();
  const open = usePackSheet((x) => x.open);
  const setOpen = usePackSheet((x) => x.setOpen);
  const [toast, setToast] = useState(false);
  const blocked = NO_DOWNLOAD.some((p) => router.pathname.startsWith(p));

  useEffect(() => {
    if (blocked) return;
    void startMuralPack();
    const online = () => void startMuralPack();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [blocked]);

  // Finished during this session → toast + fanfare (once).
  const seen = useRef(0);
  useEffect(() => {
    if (!s.justFinished || s.justFinished === seen.current) return;
    seen.current = s.justFinished;
    sfx.packReady();
    setToast(true);
    const t = setTimeout(() => setToast(false), 6000);
    return () => clearTimeout(t);
  }, [s.justFinished]);

  if (blocked) return null;

  return (
    <>
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16 }}
            className="ar-glass absolute left-3 right-3 z-[70] flex items-center gap-3 rounded-2xl !border-ar-green/50 p-2.5"
            style={{ top: "calc(var(--ar-top-inset) + 54px)" }}
            role="status"
          >
            <PackArt size={40} done />
            <div className="min-w-0 flex-1">
              <p className="font-hud text-[12px] font-bold uppercase tracking-[0.12em] text-ar-text">Mural pack ready</p>
              <p className="truncate text-[11px] text-ar-dim">Find street art and earn {platformBranding.coinName}.</p>
            </div>
            <button
              onClick={() => {
                setToast(false);
                void router.push("/murals");
              }}
              className="ar-key ar-key-primary font-hud flex h-8 items-center gap-1 rounded-full px-3 text-[10.5px] font-bold uppercase tracking-[0.1em]"
            >
              <Frame size={12} /> Try it
            </button>
            <button onClick={() => setToast(false)} aria-label="Dismiss" className="text-ar-faint">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomSheet open={open} onClose={() => setOpen(false)} labelledBy="mural-pack-title">
        <span id="mural-pack-title" className="sr-only">
          Mural pack
        </span>
        <PackPanel />
      </BottomSheet>
    </>
  );
}
