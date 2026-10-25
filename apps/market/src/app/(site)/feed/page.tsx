import type { Metadata } from "next";

import { FeedView } from "~/components/post/feed-view";
import { serverApi } from "~/server/api/server";
import { PageBody } from "@wadzzo/ui/poster/page-header";
import { platformBranding } from "@wadzzo/platform/branding";

export const metadata: Metadata = {
  title: "Feed",
  description: `Latest posts from creators on ${platformBranding.name} — drops, behind-the-scenes and members-only updates.`,
  alternates: { canonical: "/feed" },
};

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const api = await serverApi();
  const creators = await api.creator.list({ limit: 6 });

  return (
    <PageBody wide>
      <h1 className="sr-only">Feed</h1>
      <FeedView suggested={creators.items} />
    </PageBody>
  );
}
