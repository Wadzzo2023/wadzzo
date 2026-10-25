"use client";

import type { MediaType } from "@wadzzo/db";
import { Lock } from "lucide-react";

import { useRequireAuth } from "~/hooks/use-require-auth";
import { cn } from "@wadzzo/ui/lib/cn";
import { api } from "~/utils/api";

import { MEDIA_META } from "./media-meta";
import { MediaPlayer } from "./media-player";

/**
 * An item's content: playable for owners, otherwise its thumbnail behind a
 * lock (the file itself is never sent to non-owners).
 */
export function ItemMedia({
  assetId,
  name,
  thumbnail,
  mediaType,
  className,
}: {
  assetId: number;
  name: string;
  thumbnail: string;
  mediaType: MediaType;
  className?: string;
}) {
  const { signedIn } = useRequireAuth();
  const access = api.content.access.useQuery({ assetId }, { enabled: signedIn });
  const owner = access.data?.owner === true;
  const content = api.content.unlock.useQuery(
    { assetId },
    { enabled: owner, staleTime: 5 * 60_000 },
  );

  if (owner && content.data) {
    return (
      <MediaPlayer
        type={content.data.mediaType}
        url={content.data.mediaUrl}
        poster={content.data.thumbnail}
        title={content.data.name}
        className={className}
      />
    );
  }
  return (
    <LockedPreview
      name={name}
      thumbnail={thumbnail}
      mediaType={mediaType}
      checking={signedIn && (access.isLoading || (owner && content.isLoading))}
      className={className}
    />
  );
}

export function LockedPreview({
  name,
  thumbnail,
  mediaType,
  checking,
  className,
}: {
  name: string;
  thumbnail: string;
  mediaType: MediaType;
  checking?: boolean;
  className?: string;
}) {
  const meta = MEDIA_META[mediaType];
  return (
    <div className={cn("bg-surface-2 relative overflow-hidden rounded-2xl", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbnail} alt={name} className="aspect-square w-full object-cover" />
      <div className="blob bg-side-ink/95 text-side-mint absolute inset-x-3 bottom-3 flex items-center gap-2.5 p-2.5">
        <span className="bg-side text-side-ink flex size-9 items-center justify-center rounded-full">
          {checking ? <span className="loading-spinner loading-sm" /> : <Lock className="size-4" />}
        </span>
        <span className="text-sm leading-tight">
          <span className="marker block text-sm">
            {checking ? "Checking ownership…" : `${meta.label} unlocks for owners`}
          </span>
          {!checking && (
            <span className="text-side-mint/70 block text-xs">
              Own a copy to play the full content
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
