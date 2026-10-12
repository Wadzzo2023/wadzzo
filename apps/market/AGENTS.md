<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wadzzo marketplace (fans)

The fan side: home, marketplace, collection, resale, bounties, feed, wallet. App Router on Next 16; legacy `/api/game/*` routes stay for the old mobile app.

## Rules that matter

- Schema: `packages/db`. Brand creator tools live in `apps/brand`.
- Item media is only sent to owners; posts the viewer can't see are locked placeholders (decided with the product owner).
- Platform copy and assets from `@wadzzo/platform/branding`; theme `packages/platform/themes/<slug>/market.css`.
- **Never commit a `Co-Authored-By: Claude` trailer** or any other Claude attribution.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
