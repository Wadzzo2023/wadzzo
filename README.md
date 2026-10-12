# Wadzzo

One repository for everything Wadzzo runs: the brand portal, the fan marketplace, the AR collector, the task server, the mobile app and the packages they share. White-label partners (Clinton County) are **configuration of the same code**, not forks.

```
apps/
  brand/            Brand portal (create drops, stores, posts, bounties, events)     Next 16
  market/           Fan marketplace (buy assets, collections, creators, feed)        Next 16
  ar/               AR collector web app + /api/mobile/v1 for the native app         Next 16
  express-wadzzo/   Task server (map agent, job queue, hotspot drops)                Express 5
  mobile/           Native app (Expo). Not a workspace member: it installs with npm  Expo
packages/
  db/               The one Prisma schema, the generated client, the `db` instance
  errors/           AppError + ErrorCodes (one stable code per failure) + tRPC glue
  platform/         White-label: branding, themes, assets, row scoping, audit, notify
  stellar/          StellarAccount, price lookups, quote types
  ui/               Current shadcn components + shared page patterns
  utils/            Small framework-free helpers
  wallet/           Connect wallets (extension + custodial), sign, testnet/mainnet config
tooling/
  eslint/ prettier/ typescript/ vitest/    One setup shared by every package
```

## Quick start

```bash
corepack enable
pnpm install                # also generates the Prisma client
cp apps/brand/.env.example apps/brand/.env.local     # fill in, see the file's comments
pnpm dev:brand              # or dev:market, dev:ar
```

| Command                                             | What it does                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm typecheck`                                    | `tsc` for every app and package                                                |
| `pnpm lint`                                         | ESLint (errors fail; warnings are a to-do list)                                |
| `pnpm test`                                         | Vitest unit tests                                                              |
| `pnpm format` / `format:check`                      | Prettier, one config for the whole repo                                        |
| `pnpm db:generate`                                  | Re-generate the Prisma client after editing `packages/db/prisma/schema.prisma` |
| `CONFIRM_DB_PUSH=yes pnpm --filter @wadzzo/db push` | `prisma db push` (guarded: it can drop data on the shared DB)                  |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit, [docs/PLATFORMS.md](docs/PLATFORMS.md) to add a white-label platform and [docs/MIGRATION.md](docs/MIGRATION.md) for what moved where.
