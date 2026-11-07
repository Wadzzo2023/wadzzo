# Migration guide

Everything that moved when the six separate repositories became this one, what to do on the hosting side, and what behaves differently now. The original repositories are untouched and stay available for rollback.

Read [DEPLOYMENT.md](DEPLOYMENT.md) alongside this: it is the target setup (Vercel for the three web apps, AWS for the task server).

## 1. What moved where

| Before                                                      | Now                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `brand-wadzzo`, `brand-clinton`                             | `apps/brand` (+ `PLATFORM_SLUG=clintoncounty`)                                        |
| `wadzz0`                                                    | `apps/market`                                                                         |
| `wadzzoAR`, `clintonAR`                                     | `apps/ar` (+ `PLATFORM_SLUG=clintoncounty`)                                           |
| `wadzzoWebAR-public`                                        | `apps/mobile`                                                                         |
| `package/express-wadzzo` submodule                          | `apps/express-wadzzo`                                                                 |
| `package/connect_wallet` submodule                          | `packages/wallet`                                                                     |
| three copies of `prisma/schema.prisma`                      | `packages/db`                                                                         |
| every `src/server/api/routers/**` and its helpers           | `packages/api/src/{brand,market,ar,shared}/`                                          |
| `src/server/**`, `src/lib/stellar/**` (server code)         | `packages/api/src/<app>/server/**`, `packages/api/src/brand/lib/**`                   |
| `pages/api/*`, `app/api/*` handler bodies                   | `packages/api/src/<app>/{rest,mobile,game}/`; the app keeps a re-exporting route file |
| `~/types/*` forms and request schemas, banned words         | `@wadzzo/schemas`                                                                     |
| `lib/ar/{types,geo,rarity}`, `lib/murals/{constants,score}` | `@wadzzo/ar-core`                                                                     |
| map-kit geometry, `utils/geo`                               | `@wadzzo/geo`                                                                         |
| `~/server/{platform,platform-scope,audit,notify}`           | `@wadzzo/platform`                                                                    |
| `~/server/s3`, image optimisers                             | `@wadzzo/storage`                                                                     |
| next-auth options + credential sign-in                      | `@wadzzo/auth`                                                                        |
| `~/components/shadcn/ui`, `~/ui/*`                          | `@wadzzo/ui`                                                                          |
| `~/lib/stellar/account`, `quote`, `~/server/stellar/prices` | `@wadzzo/stellar`                                                                     |
| `~/env` inside server code                                  | `@wadzzo/api/env` (read on first use, never at import)                                |

### Import cheat sheet

```ts
// before                                        // now
import { api } from "~/utils/api"; // unchanged (the app's tRPC client)
import { appRouter } from "~/server/api/root"; // import { appRouter } from "@wadzzo/api/brand/router"   (or /market/router, /ar/router)
import { x } from "~/server/stellar/creator-items"; // import { x } from "@wadzzo/api/brand/server/stellar/creator-items"
import { z } from "~/types/hotspot"; // import { z } from "@wadzzo/schemas/hotspot"
import { ArPin } from "~/lib/ar/types"; // import type { ArPin } from "@wadzzo/ar-core/ar/types"
import { env } from "~/env"; // in app code: unchanged; in packages/api: "../env" (@wadzzo/api/env)
```

Rules for package code are in [ARCHITECTURE.md](ARCHITECTURE.md#rules-for-package-code) (no `~/` imports, no `server-only`, settings only through `@wadzzo/api/env`).

## 2. Environment variables

| Before                                                                        | Now                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `NEXT_AWS_BUCKET_NAME`, `_BUCKET_REGION`, `_ACCESS_KEY`, `_SECRET_ACCESS_KEY` | `AWS_*`. The old names are still read, so nothing breaks while you rename.                   |
| `NEXT_PUBLIC_STELLAR_PUBNET=true/false`                                       | `NEXT_PUBLIC_STELLAR_NETWORK=mainnet/testnet` (the old one is still read)                    |
| `.env.development` / `.env.production` per repo                               | the same files, sectioned and commented, in `apps/<app>/` (git-ignored)                      |
| `.env.clintoncounty*` in the brand and AR repos                               | `apps/brand/.env.clintoncounty*`, `apps/ar/.env.clintoncounty*` (overrides only)             |
| three hand-kept lists of variable names                                       | one `apps/<app>/.env.example` per app, tracked                                               |
| none                                                                          | `PLATFORM_SLUG` (default `wadzzo`), `DATABASE_POOL_MAX`, `APPLE_SIGN_IN_AUDIENCE` (optional) |

Moving the real files was done by copying (the originals are unchanged) with every value preserved byte-for-byte. Re-run `pnpm env:check` after any edit: it verifies that what must be identical across the apps is, and that each app's URLs match the three domains.

> **Production values live in the host, not in these files.** The old brand deploy wrote `.env.production` from a GitHub secret. Treat the files as a starting point and confirm each production value against what is actually configured before cutover. `pnpm env:check` flagged three that look stale: AR's production `DATABASE_URL` pointing at a different database from brand and market, and market's `NEXTAUTH_URL` / `NEXT_PUBLIC_URL`.

## 3. Hosting migration (old servers → Vercel + AWS)

The code can run both ways, so the move is a DNS switch with the old servers kept as the rollback.

### Order

1. **Development first.** Create the three Vercel projects, `develop` branch, `dev-*` domains and the development environment variables ([DEPLOYMENT.md §2](DEPLOYMENT.md#2-vercel-one-project-per-app)). Verify against a development database on testnet.
2. **Worker.** (Done 2026-11-06/07.) The task server moved to a Docker container on the `bandcoin-worker` instance behind Caddy, and then to the database job queue: the brand app no longer calls it, so there is no URL to switch (see [DEPLOYMENT.md §4](DEPLOYMENT.md#4-the-worker-on-aws)).
3. **Production web apps, one at a time**, in this order: `ar` (smallest blast radius, has a health-style endpoint), `market`, `brand`:
   1. Create the Vercel project, add the production variables, deploy to the `*.vercel.app` URL, and run the checks in [DEPLOYMENT.md §5](DEPLOYMENT.md#checks-after-any-deployment) against it.
   2. Lower the DNS TTL of the real domain a day before.
   3. Add the real domain to the Vercel project and switch the record.
   4. Watch error rates for a day. Keep the old server running for a week.
4. **Retire** the old EC2 web processes and the `deploy-brand` / `deploy-market` workflows (already removed here).

### What survives the cutover

- **Sessions.** NextAuth sessions are JWTs signed with `NEXTAUTH_SECRET`. Keep the production value and users stay signed in; the mobile app's tokens likewise (`MOBILE_JWT_SECRET`, or `NEXTAUTH_SECRET`).
- **URLs.** `/api/mobile/v1/*`, `/.well-known/stellar.toml` and the legacy `/api/game/*` keep their paths and contracts.
- **Data.** There is no data migration: the database and bucket are the same. Confirm the `Platform` table has the `wadzzo` row (and `clintoncounty` if used); the SQL in `packages/db/prisma/sql/` is applied by hand, in date order, if it hasn't been.

### Rollback

Web apps: move the DNS record back (the old server is still there), or in Vercel promote the previous deployment. Worker: the deploy script goes back to the previous image by itself if the new one doesn't answer. Nothing in the database has changed, so there is nothing to undo there.

### Things to expect on Vercel that the old servers didn't have

- Many short-lived function instances instead of one long process: set `DATABASE_POOL_MAX=1` and put PgBouncer in front of Postgres ([DEPLOYMENT.md §3](DEPLOYMENT.md#3-database)).
- A function time limit (`maxDuration` in each `vercel.json`). Long work belongs on the task server.
- Previews and the `dev-*` domains also run `NODE_ENV=production`; the code now uses `VERCEL_ENV` to tell them from production.

## 4. Behaviour changes

Some of these are deliberate fixes of problems that existed in the original repositories.

**Security and access**

- Procedures that take `signWith` accept only the caller's own custodial account, or `{ isAdmin }` from a real admin of the platform. Before, any signed-in user could ask the platform key to sign for them.
- A wallet sign-in must be the challenge the server issued for that key, signed within the last 5 minutes. Before, any transaction the key had ever signed (public on the ledger) was accepted. Wallets that take longer than 5 minutes to sign will be asked to sign again.
- Apple sign-in resolves the account from what Apple's token vouches for, not from an email the client sends, and needs Apple to share a verified email.
- Sign-in requests are validated against a schema; a malformed one is `WALLET_AUTH_FAILED`.
- Server-side image fetches refuse private and link-local addresses (also through redirects) and cap size and time.
- `stellar.toml` values are escaped, and an asset without a description no longer renders `desc="null"`.
- Bounty comments follow the bounty's visibility (approved, and on this platform).
- Redeem codes come from a secure random source.

**Behaviour**

- Apple custodial accounts can sign on mainnet (the old `clientsign` fell through to `false`).
- A WalletConnect sign-in records `WalletType.walletConnect` (it used to record `rabet`), and uses the configured network's chain.
- Rabet is given `mainnet` / `testnet` (a regression in an earlier version of this migration sent the passphrase).
- The market's `stellar.toml` is scoped to its platform, like the brand portal's.
- The bounty router is the union of the market and AR versions; the mobile API still omits the new web-only fields.
- Bandcoin / Actionverse special cases (share links, hashtag) are gone: platforms replace them.
- `StellarAccount.create/createOrNull` are `loadOrThrow/load`; `getTokenBalance` is `tokenBalance`.
- Market's legacy game API now stamps the platform on bounty joins and pin claims.
- Clinton County's market gets its logo and favicon (a `shared/` asset layer feeds every app).
- `NEXT_PUBLIC_STELLAR_NETWORK` is required (or the old `NEXT_PUBLIC_STELLAR_PUBNET`); a build that skips validation falls back to testnet, never mainnet.

## 5. Known gaps

- **Albedo login** signs a token the client chooses, so a captured signature can be replayed. Fixing it needs a server-issued nonce, which changes the mobile contract.
- **Custodial accounts on testnet.** The central accounts service funds and creates accounts on mainnet only. A custodial user's key still signs testnet transactions, but their account must be funded on testnet separately.
- **`apps/mobile`** is not a workspace member and keeps hand-copied versions of the AR types, geometry and rarity modules; they have drifted from `@wadzzo/ar-core`. Making it consume the shared package is the next planned change.
- **Not exercised in a live environment:** the task server (Express 5, helmet 8, express-rate-limit 8, Prisma 7) and the Vercel deployments themselves. Do steps 1 and 2 of section 3 before trusting production to them.
- **Duplicated logic that now sits side by side** but isn't merged yet: issuer-key encryption (three copies), the follow-creator transactions, and the user profile update/balance logic in market and AR.

## 6. Checks to run

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check   # the CI gate
pnpm env:check                                                   # the real env files agree with each other
```
