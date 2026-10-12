<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Wadzzo AR (web + mobile API)

The AR pin-collecting app. The web app (Next 16, App Router) is the phone-frame experience; `src/app/api/mobile/v1` is the API the native mobile app (wadzzoWebAR-public) uses.

## Rules that matter

- **The database is shared.** `prisma/schema.prisma` is a COPY of `brand-wadzzo/prisma/schema.prisma`. Edit it there, then copy it here (keep CRLF line endings) and run `pnpm db:generate`. Never `prisma db push` from this repo.
- **Never change an existing `/api/mobile/v1` contract** (routes, params, response shape, the `{ error: { code, message } }` error body). The mobile app and other projects depend on it. Add routes instead.
- **`package/connect_wallet` is a git submodule** tracking branch `wadzzo-appRouter`. It is shared with the other apps, so keep changes there compatible with older `@stellar/stellar-sdk` versions (wadzz0 and brand-wadzzo are still on 12). Commit inside the submodule first, then commit the new pointer here.
- **Never commit a `Co-Authored-By: Claude` trailer** or any other Claude attribution.

## Stack and conventions

- Next 16 App Router, React 19, TypeScript 6, Tailwind 4 (theme tokens live in `src/styles/globals.css` under `@theme`; there is no `tailwind.config`), tRPC 11 + TanStack Query 5, Prisma 7 (driver adapter in `src/server/db.ts`), NextAuth, pnpm.
- Dev and build use webpack (`next dev --webpack`) because of the onnxruntime / transformers externals in `next.config.js`.
- Pages are in `src/app`: `(shell)` for the phone-frame screens (wrapped by `AppFrame`), `(bare)` for `/albedo` and `/embed/[id]`. Page files are client components.
- `src/lib/navigation.ts` is a small shim (`useRouter`, `useQueryParams`) so older code written for `next/router` keeps working. Prefer `next/navigation` in new code.
- API routes are route handlers: `/api/trpc/[trpc]`, `/api/auth/[...nextauth]`, `/api/mobile/v1/[...route]`, `/api/proxy-image`, `/api/embed/track`, `/api/events/[id]/ics`.
- Server helpers take the app's `Db` type (from `~/server/db`), not `PrismaClient`.
- **Claim to wallet** (`src/server/stellar/claim.ts`, router `claim`, UI `components/claim/ClaimToWallet.tsx`): collecting a pin only records the collect; claiming delivers the pin's item on-chain. The copy comes from the brand's storage stock first, otherwise it is minted for the collector (needs `ISSUER_ENCRYPTION_KEY`; limit respected). The collector pays the platform fee, the network fee and the 0.5 XLM reserve if needed, and the quote shows all of it first. Logged as an `AssetTransaction` of type `CLAIM`, linked from `LocationConsumer.claimTxId` (one claim per collect). Never touches `/api/mobile/v1`.
- Notifications: `~/server/notify` (`notifyBrand`, `notifyFan`); the inbox UIs live in brand-wadzzo and wadzz0.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. `pnpm test:e2e` runs the claim end to end against the dev database and Stellar testnet with a throwaway collector (needs `.env.development`, including `ISSUER_ENCRYPTION_KEY`; it cleans up its rows) (use `SKIP_ENV_VALIDATION=1` only to see that it compiles: with validation skipped `NEXT_PUBLIC_STELLAR_PUBNET="false"` is read as true, so the output points at mainnet).
