import { TRPCError } from "@trpc/server";
import { BadgeCheck, ChevronRight, ExternalLink, Repeat2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { creatorHref } from "~/lib/creator";
import { ItemActivity } from "~/components/market/item-activity";
import { BuyPanel } from "~/components/market/buy-panel";
import { ItemActions } from "~/components/market/item-actions";
import { ListingCard, ListingGrid } from "~/components/market/listing-card";
import { MintProgress } from "~/components/market/mint-progress";
import { ItemMedia } from "~/components/media/item-media";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wadzzo/ui/components/tabs";
import { MEDIA_META } from "~/components/media/media-meta";
import { env } from "~/env";
import { serverApi } from "~/server/api/server";
import { PageBody } from "@wadzzo/ui/patterns/page-header";
import { Section } from "~/ui/section";
import { Avatar } from "@wadzzo/ui/patterns/person";
import { stellarNetwork } from "@wadzzo/wallet/config";
import { platformBranding } from "@wadzzo/platform/branding";

const getItem = cache(async (id: number) => {
  try {
    return await (await serverApi()).market.item({ assetId: id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") return null;
    throw e;
  }
});

async function load(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) ? getItem(id) : null;
}

export async function generateMetadata({ params }: PageProps<"/item/[id]">): Promise<Metadata> {
  const item = await load(params);
  if (!item) return { title: "Item not found", robots: { index: false } };
  const description = (
    item.description ??
    `${MEDIA_META[item.mediaType].label} by ${item.creator?.name ?? "${platformBranding.name}"}`
  ).slice(0, 180);
  return {
    title: `${item.name} by ${item.creator?.name ?? "${platformBranding.name}"}`,
    description,
    alternates: { canonical: `/item/${item.id}` },
    openGraph: {
      title: item.name,
      description,
      images: [{ url: item.thumbnail, alt: item.name }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: item.name,
      description,
      images: [item.thumbnail],
    },
  };
}

export default async function ItemPage({ params, searchParams }: PageProps<"/item/[id]">) {
  const item = await load(params);
  if (!item) notFound();

  // ?listing=<id> opens the page on one fan resale; otherwise it sells the creator's own listing.
  const wanted = Number((await searchParams).listing);
  const resale = Number.isInteger(wanted)
    ? (item.resales.find((r) => r.id === wanted) ?? null)
    : null;
  const listing = resale ?? item.original;
  const related = await (await serverApi()).market.related({ assetId: item.id });
  const resales = related.resales.filter((r) => r.id !== resale?.id);

  const meta = MEDIA_META[item.mediaType];
  const lowest = [item.original, ...item.resales]
    .filter(Boolean)
    .sort((a, b) => a!.price - b!.price)[0];
  const left = item.limit == null ? null : Math.max(0, item.limit - item.mintedCount);
  const expert = `https://stellar.expert/explorer/${stellarNetwork.stellarExpertNetwork}/asset/${item.code}-${item.issuer}`;

  // Structured data so search engines can show the item with its price.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: item.name,
    image: item.thumbnail,
    description: item.description ?? undefined,
    brand: item.creator ? { "@type": "Brand", name: item.creator.name } : undefined,
    offers: lowest
      ? {
          "@type": "Offer",
          price: lowest.priceUSD.toFixed(2),
          priceCurrency: "USD",
          availability:
            left === 0 && !item.resales.length
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock",
          url: `${env.NEXT_PUBLIC_URL}/item/${item.id}`,
        }
      : undefined,
  };

  return (
    <div className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* Immersive backdrop: the art itself, blurred, fading into the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbnail}
          alt=""
          className="size-full scale-125 object-cover opacity-35 blur-3xl dark:opacity-30"
        />
        <div className="from-background/30 via-background/75 to-background absolute inset-0 bg-gradient-to-b" />
      </div>

      <PageBody wide className="relative">
        <nav
          className="text-muted-foreground mb-6 flex items-center gap-1.5 text-sm"
          aria-label="Breadcrumb"
        >
          <Link href="/marketplace" className="hover:text-foreground">
            Marketplace
          </Link>
          <ChevronRight className="size-3.5" />
          {item.creator && (
            <>
              <Link href={creatorHref(item.creator)} className="hover:text-foreground truncate">
                {item.creator.name}
              </Link>
              <ChevronRight className="size-3.5" />
            </>
          )}
          <span className="text-foreground truncate">{item.name}</span>
        </nav>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          {/* Art: stays in view while the details scroll. */}
          <div className="space-y-3 lg:sticky lg:top-24">
            <div className="glass mx-auto w-full max-w-[min(100%,calc(100dvh-14rem))] rounded-3xl p-1.5 shadow-[0_30px_80px_-30px_hsl(var(--primary)/0.5)]">
              <ItemMedia
                assetId={item.id}
                name={item.name}
                thumbnail={item.thumbnail}
                mediaType={item.mediaType}
                className="rounded-[1.25rem]"
              />
            </div>
            <div className="mx-auto w-full max-w-[min(100%,calc(100dvh-14rem))]">
              <ItemActions assetId={item.id} name={item.name} explorerUrl={expert} />
            </div>
          </div>

          <div className="min-w-0 space-y-5">
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {item.creator && (
                  <Link
                    href={creatorHref(item.creator)}
                    className="glass hover:border-primary/40 inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-semibold transition-colors"
                  >
                    <Avatar
                      src={item.creator.profileUrl}
                      name={item.creator.name}
                      className="size-6 text-[10px]"
                    />
                    {item.creator.name}
                    <BadgeCheck className="text-primary size-4" />
                  </Link>
                )}
                <span className="glass text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
                  <meta.icon className="size-3.5" /> {meta.label}
                </span>
              </div>
              <h1 className="font-hud text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl">
                {item.name}
              </h1>
            </header>

            <MintProgress minted={item.mintedCount} limit={item.limit} />

            {resale && (
              <div className="bg-primary/10 ring-primary/25 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm ring-1">
                <span className="flex items-center gap-2 font-medium">
                  <Repeat2 className="text-primary size-4" /> Resale from{" "}
                  {resale.placer?.name ?? "a fan"}
                </span>
                <Link
                  href={`/item/${item.id}`}
                  className="text-primary font-semibold hover:underline"
                >
                  Buy from the creator instead
                </Link>
              </div>
            )}

            <div className="glass rounded-2xl p-4 shadow-[0_20px_60px_-25px_hsl(var(--primary)/0.4)] sm:p-5">
              <BuyPanel item={item} listing={listing} />
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="glass h-11 w-full justify-start gap-1 rounded-xl p-1">
                <TabsTrigger value="overview" className="rounded-lg px-4">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="details" className="rounded-lg px-4">
                  Details
                </TabsTrigger>
                <TabsTrigger value="activity" className="rounded-lg px-4">
                  Activity
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <p className="text-muted-foreground text-[15px] leading-relaxed whitespace-pre-line">
                  {item.description?.trim() ? item.description : "No description yet."}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Type", meta.label],
                    ["Edition", item.limit == null ? "Open" : item.limit.toLocaleString("en-US")],
                    ["Royalty", `${item.royaltyPercent}%`],
                    ["Chain", "Stellar"],
                  ].map(([k, v]) => (
                    <div key={k} className="glass rounded-xl p-3 text-center">
                      <p className="text-primary text-[10px] font-semibold tracking-wider uppercase">
                        {k}
                      </p>
                      <p className="font-hud mt-0.5 text-sm font-bold">{v}</p>
                    </div>
                  ))}
                </div>
                {item.creator && (
                  <Link
                    href={creatorHref(item.creator)}
                    className="glass hover:border-primary/40 flex items-center gap-3 rounded-xl p-3 transition-colors"
                  >
                    <Avatar
                      src={item.creator.profileUrl}
                      name={item.creator.name}
                      className="size-11"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-muted-foreground block text-[11px] font-semibold tracking-wider uppercase">
                        Created by
                      </span>
                      <span className="block truncate font-semibold">{item.creator.name}</span>
                      {item.creator.bio && (
                        <span className="text-muted-foreground line-clamp-1 text-sm">
                          {item.creator.bio}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="text-muted-foreground size-4" />
                  </Link>
                )}
              </TabsContent>

              <TabsContent value="details" className="mt-4">
                <dl className="glass divide-foreground/[0.06] divide-y rounded-xl text-sm">
                  {[
                    ["Token code", item.code],
                    ["Issuer", `${item.issuer.slice(0, 6)}…${item.issuer.slice(-6)}`],
                    [
                      "Supply",
                      item.limit == null ? "Unlimited" : item.limit.toLocaleString("en-US"),
                    ],
                    ["Minted", item.mintedCount.toLocaleString("en-US")],
                    ["Creator royalty", `${item.royaltyPercent}% of every resale`],
                    ["Network", stellarNetwork.isMainnet ? "Stellar" : "Stellar testnet"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="truncate font-mono text-[13px] font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <a
                  href={expert}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline"
                >
                  View on Stellar Expert <ExternalLink className="size-3.5" />
                </a>
              </TabsContent>

              <TabsContent value="activity" className="mt-4">
                <ItemActivity assetId={item.id} />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="mt-14 space-y-10">
          {resales.length > 0 && (
            <Section
              title="Resale listings"
              description={`Fans reselling ${item.name}, cheapest first.`}
            >
              <ListingGrid>
                {resales.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </ListingGrid>
            </Section>
          )}
          {related.moreFromCreator.length > 0 && item.creator && (
            <Section title={`More from ${item.creator.name}`} href={creatorHref(item.creator)}>
              <ListingGrid>
                {related.moreFromCreator.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </ListingGrid>
            </Section>
          )}
          {related.similar.length > 0 && (
            <Section
              title={`More ${meta.label.toLowerCase()} items`}
              href={`/marketplace?type=${item.mediaType}`}
            >
              <ListingGrid>
                {related.similar.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </ListingGrid>
            </Section>
          )}
        </div>
      </PageBody>
    </div>
  );
}
