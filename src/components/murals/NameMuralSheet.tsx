import { Check, PencilLine } from "lucide-react";
import { useEffect, useState } from "react";

import { ArButton } from "~/components/ui/ArButton";
import { BottomSheet } from "~/components/ui/BottomSheet";
import { useNameMural } from "~/lib/murals/useMurals";

/**
 * ── NameMuralSheet ─────────────────────────────────────────────────────────
 *
 * Optional, skippable. Any of the first finders may name a mural; the first
 * one to save wins (plan §12.3). If someone beat them to it, the sheet says
 * so and shows the name that stuck rather than an error.
 */
export function NameMuralSheet({
  muralId,
  autoTitle,
  open,
  onClose,
}: {
  muralId: string;
  autoTitle: string;
  open: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const name = useNameMural();

  useEffect(() => {
    if (open) {
      setTitle("");
      setArtist("");
      name.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open]);

  // Either way the server answered with the name that stuck.
  const answered = name.data != null;
  const saved = name.data?.named === true;

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="name-mural-title">
      <div className="px-5 pt-4">
        <h2 id="name-mural-title" className="font-hud flex items-center gap-2 text-[16px] font-bold text-ar-text">
          <PencilLine size={17} strokeWidth={2.4} className="text-rarity-epic" />
          Name this mural
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ar-dim">
          You&apos;re one of its first finders. Give it a name people will see on the map — or skip and it stays
          &ldquo;{autoTitle}&rdquo;.
        </p>

        {answered ? (
          <div className="mt-5 rounded-ar border border-ar-line p-4 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-ar-green/60 bg-ar-green/15 text-ar-green-hot">
              <Check size={18} strokeWidth={3} />
            </span>
            <p className="font-hud mt-2 text-[14px] font-bold text-ar-text">{name.data?.title}</p>
            {name.data?.artist && <p className="text-[12px] text-ar-dim">by {name.data.artist}</p>}
            <p className="mt-2 text-[11.5px] text-ar-faint">
              {saved ? "Saved — that's its name now." : "Another finder named it first."}
            </p>
            <ArButton variant="primary" size="md" block className="mt-4" onClick={onClose}>
              Done
            </ArButton>
          </div>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim().length < 2) return;
              name.mutate({ muralId, title: title.trim(), artist: artist.trim() ? artist.trim() : undefined });
            }}
          >
            <label className="block">
              <span className="font-hud text-[10.5px] font-bold uppercase tracking-[0.12em] text-ar-faint">Title</span>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="e.g. Blue Heron"
                className="mt-1 w-full rounded-ar border border-ar-line bg-white/[0.04] px-3 py-2.5 text-[14px] text-ar-text outline-none placeholder:text-ar-faint focus:border-rarity-epic/70"
              />
            </label>
            <label className="block">
              <span className="font-hud text-[10.5px] font-bold uppercase tracking-[0.12em] text-ar-faint">
                Artist <span className="normal-case tracking-normal">(if you know)</span>
              </span>
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                maxLength={80}
                placeholder="Artist or crew"
                className="mt-1 w-full rounded-ar border border-ar-line bg-white/[0.04] px-3 py-2.5 text-[14px] text-ar-text outline-none placeholder:text-ar-faint focus:border-rarity-epic/70"
              />
            </label>
            {name.error && <p className="text-[12px] text-ar-danger">{name.error.message}</p>}
            <div className="space-y-2 pt-1">
              <ArButton variant="primary" size="md" block type="submit" disabled={title.trim().length < 2 || name.isLoading}>
                {name.isLoading ? "Saving…" : "Save name"}
              </ArButton>
              <ArButton variant="ghost" size="md" block type="button" onClick={onClose}>
                Skip
              </ArButton>
            </div>
          </form>
        )}
      </div>
    </BottomSheet>
  );
}
