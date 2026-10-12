# Architecture

## One database, one schema

`packages/db/prisma/schema.prisma` is the only copy of the schema. Every app and the task server generate their client from it.

- Import models, enums and `Prisma` from `@wadzzo/db` (safe in the browser).
- Import the client from `@wadzzo/db/server` (`db`); it opens connections and must not reach a client bundle.
- Never run `prisma db push` from habit: the `push` script refuses unless `CONFIRM_DB_PUSH=yes`.

## One network per deployment

`@wadzzo/wallet/config` resolves the Stellar network once:

```
NEXT_PUBLIC_STELLAR_NETWORK = testnet | mainnet      (legacy: NEXT_PUBLIC_STELLAR_PUBNET = true | false)
```

`stellarNetwork` carries everything that differs: passphrase, Horizon URL, the names Albedo and WalletConnect expect, and the Stellar Expert segment. Providers never ask "is this mainnet?"; they read the config. A testnet deployment can't sign a mainnet transaction.

## Wallets

`@wadzzo/wallet` exposes every sign-in through one `WalletProvider` interface:

| Kind | Providers |
| --- | --- |
| Extension / app | Freighter, Albedo, xBull, Rabet, Hana, HOT, MetaMask (Stellar snap), WalletConnect |
| Custodial (keys held by the accounts service) | Email + password, Google, Apple, Facebook |

- Browser: `signAndSubmitTransaction({ xdr, publicKey, walletType })`.
- Server: `signXdrForCustodialUser`, `buildLoginChallengeXdr`, `verifyTransactionSignature`.
- Entries are split by environment so a server module can never pull in UI: `@wadzzo/wallet` (UI + hooks), `/shared` (types, schemas), `/stellar`, `/firebase`, `/config`, `/server`.

## Errors

Every deliberate failure is an `AppError` with a code from `@wadzzo/errors` (`ErrorCodes.WALLET_SIGNING_REJECTED`, `STELLAR_TRUSTLINE_MISSING`, ...). Each code fixes its HTTP status, tRPC code and a safe default message. The tRPC base procedure converts `AppError` to the matching `TRPCError` and adds `data.appCode` to the response, so clients can branch on a stable string. The mobile API keeps its wire contract (`{ error: { code, message } }` with tRPC code names); server-side failures there stay generic.

## White-label

See [PLATFORMS.md](PLATFORMS.md). `PLATFORM_SLUG` selects branding, theme and assets at build time and the `Platform` row at run time; rows are scoped by `@wadzzo/platform/scope`.

## Deploying

- Web apps: one deployment per app per platform, same repo, different env (`PLATFORM_SLUG`, `NEXT_PUBLIC_STELLAR_NETWORK`, ...). Each app runs `sync:platform` before `dev`/`build`.
- `apps/express-wadzzo` compiles with `tsc` and runs under PM2 (`ecosystem.config.cjs`). It depends on no workspace TypeScript package at runtime.
- `.github/workflows`: `ci.yml` (format, typecheck, lint, test), `deploy-brand.yml`, `deploy-market.yml` (path-filtered, EC2).

## Conventions

- File names are kebab-case and say what the file does; functions are verbs.
- No duplicated components or helpers: if two apps need it, it lives in a package.
- `strict` TypeScript, Zod at boundaries, no bare `throw new Error` (lint warns).
- Dependencies are versions in the root `pnpm-workspace.yaml` catalog; packages ask for `catalog:`.
