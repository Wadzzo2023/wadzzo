<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wadzzo AR (web + mobile API)

The AR pin-collecting app. The web app (Next 16, App Router) is the phone-frame experience; `src/app/api/mobile/v1` is the API the native mobile app (`apps/mobile`) uses.

## Rules that matter

- **The database schema lives in `packages/db`.** Edit `packages/db/prisma/schema.prisma`, then `pnpm db:generate`. Never `prisma db push` casually: the push script is guarded.
- **Never change an existing `/api/mobile/v1` contract** (routes, params, response shape, the `{ error: { code, message } }` error body). The mobile app and other projects depend on it. Add routes instead.
- **Platform look and copy come from `@wadzzo/platform/branding`**, never from literals; themes live in `packages/platform/themes/<slug>/ar.css`.
- **Wallet code is `@wadzzo/wallet`** (browser) and `@wadzzo/wallet/server`. Don't import the browser entry from server code.
- **Never commit a `Co-Authored-By: Claude` trailer** or any other Claude attribution.

## Stack

Next 16 App Router, React 19, TypeScript 6, Tailwind 4 (tokens in `src/styles/globals.css` and `arcade.css`; `platform-theme.css` is generated), tRPC 11 + TanStack Query 5, Prisma 7 via `@wadzzo/db/server`, NextAuth, pnpm.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (from this folder, or `pnpm --filter @wadzzo/ar <script>`).
