import type { Metadata } from "next";
import { cache } from "react";

import { decodePreview, normalizeConfig, brandOrigins, type EmbedConfig } from "~/lib/embed/config";
import { db } from "~/server/db";

import { EmbedClient } from "./EmbedClient";

/**
 * ── /embed/[id] ────────────────────────────────────────────────────────────
 *
 * The page inside a website's iframe. Settings come from the brand's saved
 * `MapEmbed` (or, for `/embed/preview?c=…`, from brand-wadzzo's editor), read
 * on the server. The CSP `frame-ancestors` header — the domain allowlist — is
 * set by `src/proxy.ts`, so it goes out with the very first response.
 *
 * Nothing here signs anyone in: third-party iframes can't hold a session
 * reliably (Safari drops the cookies), so gated drops show locked, and every
 * action hands off to wadzzoAR in a new tab.
 */
type Loaded = { config: EmbedConfig; previewOrigins?: string[] } | null;

const load = cache(async (id: string, c: string | undefined): Promise<Loaded> => {
  if (id === "preview") {
    return { config: normalizeConfig(decodePreview(c) ?? {}, "preview"), previewOrigins: brandOrigins() };
  }
  const row = id ? await db.mapEmbed.findUnique({ where: { id } }) : null;
  return row?.enabled ? { config: normalizeConfig(row, row.id) } : null;
});

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export async function generateMetadata({ params, searchParams }: PageProps<"/embed/[id]">): Promise<Metadata> {
  const loaded = await load((await params).id, one((await searchParams).c));
  return { title: `${loaded?.config.name ?? "Map unavailable"} · Wadzzo`, robots: { index: false } };
}

export default async function EmbedPage({ params, searchParams }: PageProps<"/embed/[id]">) {
  const loaded = await load((await params).id, one((await searchParams).c));
  if (!loaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-ar-bg p-6 text-center">
        <div>
          <p className="font-hud text-[12px] font-semibold uppercase tracking-[0.16em] text-ar-dim">Map unavailable</p>
          <p className="mt-1 text-[12px] text-ar-faint">This Wadzzo map has been turned off or removed.</p>
        </div>
      </div>
    );
  }
  return <EmbedClient initialConfig={loaded.config} previewOrigins={loaded.previewOrigins} />;
}
