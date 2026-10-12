<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wadzzo brand portal

Where brands create and manage drops, stores, posts, bounties and events (Next 16, App Router + a few pages-router API routes).

## Rules that matter

- Schema: `packages/db/prisma/schema.prisma` (single source for every app). `pnpm db:generate` after editing.
- New rows of platform-stamped models must set `platformId`; queries use `platformScope` / `relationScope` from `@wadzzo/platform/scope` (`tests/platform-stamping.test.ts` guards it).
- Platform copy, colours and URLs: `platformBranding` from `@wadzzo/platform/branding`.
- Failures are `AppError` with an `ErrorCodes` code; tRPC maps them and sends `data.appCode`.
- The task server is `apps/express-wadzzo`; `src/lib/agent/contract.ts` must stay byte-identical to its `src/agent/contract.ts` (a test checks it).
- **Never commit a `Co-Authored-By: Claude` trailer** or any other Claude attribution.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
