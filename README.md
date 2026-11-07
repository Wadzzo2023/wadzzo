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
  api/              Every API: brand/, market/, ar/ routers, server code and REST handlers; shared/ for what several apps use
  auth/             Credential sign-in (wallets, Firebase, email) and the NextAuth options
  db/               The one Prisma schema, the generated client, the `db` instance
  errors/           AppError + ErrorCodes (one stable code per failure) + tRPC glue
  platform/         White-label: branding, themes, assets, row scoping, audit, notify, notifications, stellar.toml
  storage/          The S3 bucket: public URLs, presigned uploads, image helpers, upload rules
  stellar/          StellarAccount, price lookups, quote types
  ui/               Current shadcn components + shared page patterns (PageBody, skeletons, ...)
  utils/            Small framework-free helpers
  wallet/           Connect wallets (extension + custodial), sign, testnet/mainnet config
  schemas/          Zod schemas shared by forms and procedures
  ar-core/          Pure AR domain code (types, distance, rarity, murals)
  agent-contract/   Types shared by the brand portal's agent UI and the task server
  geo/              Random-location helpers shared by the portal and the task server
tooling/
  eslint/ prettier/ typescript/ vitest/    One setup shared by every package
  local-db/         `pnpm db:local`: an embedded Postgres with the shared schema
```

## Deployments

| App                   | Wadzzo                                           | Clinton County                                             | Vercel project(s)               |
| --------------------- | ------------------------------------------------ | ---------------------------------------------------------- | ------------------------------- |
| `apps/market`         | [web.wadzzo.com](https://web.wadzzo.com)         |                                                            | `wadzzo`                        |
| `apps/brand`          | [brand.wadzzo.com](https://brand.wadzzo.com)     | [clintonadmin.wadzzo.com](https://clintonadmin.wadzzo.com) | `brand-wadzzo`, `brand-clinton` |
| `apps/ar`             | [app.wadzzo.com](https://app.wadzzo.com)         | [clinton.wadzzo.com](https://clinton.wadzzo.com)           | `ar-web-wadzzo`, `clinton-ar`   |
| `apps/express-wadzzo` | EC2 (Docker, Caddy), `deploy-express-docker.yml` | shared                                                     |                                 |
| `apps/mobile`         | App Store / Play (EAS)                           |                                                            |                                 |

A push to `main` rebuilds only the Vercel projects whose app or packages changed. Details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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

Start with [docs/RUNBOOK.md](docs/RUNBOOK.md) to run and manage the repo, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) to deploy (Vercel for the web apps, AWS for the task server), [docs/PLATFORMS.md](docs/PLATFORMS.md) to add a white-label platform and [docs/MIGRATION.md](docs/MIGRATION.md) for what moved where.

PDF copies of the runbook and the deployment guide are in `docs/pdf/` (regenerate with `node scripts/docs-to-pdf.mjs`).

## History

This repository replaces the separate repositories below, which are archived and read-only. Their full history was imported here (with leaked secrets removed).

| Old repository                  | Now                                          |
| ------------------------------- | -------------------------------------------- |
| `Wadzzo2023/wadzz0`             | `apps/market`                                |
| `Wadzzo2023/brand-wadzzo`       | `apps/brand`                                 |
| `Wadzzo2023/brand-clinton`      | `apps/brand` + `PLATFORM_SLUG=clintoncounty` |
| `Wadzzo2023/ARWebWadzzo`        | `apps/ar`                                    |
| `Wadzzo2023/clintonAR`          | `apps/ar` + `PLATFORM_SLUG=clintoncounty`    |
| `Wadzzo2023/wadzzoWebAR-public` | `apps/mobile`                                |
| `Wadzzo2023/express-wadzzo`     | `apps/express-wadzzo`                        |

`Wadzzo2023/connect_wallet` stays a separate repository. Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · Security: [SECURITY.md](SECURITY.md).
