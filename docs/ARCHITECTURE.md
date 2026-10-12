# Architecture

## One database, one schema

`packages/db/prisma/schema.prisma` is the only copy of the schema. Every app and the task server generate their client from it.

- Import models, enums and `Prisma` from `@wadzzo/db` (safe in the browser).
- Import the client from `@wadzzo/db/server` (`db`); it opens connections and must not reach a client bundle.
- Never run `prisma db push` from habit: the `push` script refuses unless `CONFIRM_DB_PUSH=yes`.

## Server foundation

- `@wadzzo/api`: one tRPC context (`session`, `platform`, `db`), `publicProcedure` / `protectedProcedure`, and routers shared by several apps (`fan-bounty`). Apps add their own admin/creator procedures on top.
- `@wadzzo/auth`: `authorizeCredentials` (wallet signature, Firebase token, email + password) and `authOptions` for NextAuth; the mobile API calls the same function.
- `@wadzzo/storage`: the one S3 bucket: `publicS3Url`, `signEntryUpload`, `uploadBufferToS3`, `createOptimizedImage`, upload rules.
- The task server (`apps/express-wadzzo`) is bundled with tsup so it can import these workspace packages.

## One network per deployment

`@wadzzo/wallet/config` resolves the Stellar network once:

```
NEXT_PUBLIC_STELLAR_NETWORK = testnet | mainnet      (legacy: NEXT_PUBLIC_STELLAR_PUBNET = true | false)
```

`stellarNetwork` carries everything that differs: passphrase, Horizon URL, the names Albedo and WalletConnect expect, and the Stellar Expert segment. Providers never ask "is this mainnet?"; they read the config. A testnet deployment can't sign a mainnet transaction.

## Wallets

`@wadzzo/wallet` exposes every sign-in through one `WalletProvider` interface:

| Kind                                          | Providers                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| Extension / app                               | Freighter, Albedo, xBull, Rabet, Hana, HOT, MetaMask (Stellar snap), WalletConnect |
| Custodial (keys held by the accounts service) | Email + password, Google, Apple, Facebook                                          |

- Browser: `signAndSubmitTransaction({ xdr, publicKey, walletType })`.
- Server: `signXdrForCustodialUser`, `buildLoginChallengeXdr`, `verifyLoginChallenge`.
- One Horizon client: `horizonServer()` from `@wadzzo/wallet/stellar`. Nothing builds its own.
- The central accounts service (`stellar-accounts`) creates and funds custodial accounts on **mainnet only**. On a testnet deployment a custodial user's key still signs testnet transactions, but the account has to be funded on testnet separately.
- Entries are split by environment so a server module can never pull in UI: `@wadzzo/wallet` (UI + hooks), `/shared` (types, schemas), `/stellar`, `/firebase`, `/config`, `/server`.

## Who may sign, and who may sign in

These checks live in the shared packages so no app can forget them:

- **Signer guard** (`@wadzzo/api`): procedures that take `signWith` accept only the caller's own custodial account, or `{ isAdmin }` from a real admin of the platform. Anything else is `AUTH_FORBIDDEN` before the procedure runs.
- **Login challenge** (`verifyLoginChallenge`): a wallet login must be the challenge we issued for that key (one payment of 0.000001 XLM to the platform account), signed, and not older than 5 minutes. A transaction the account signed for anything else, which is public on the ledger, can't be replayed as a login.
- **Apple sign-in**: the account comes from what Apple's identity token vouches for (its linked Firebase user, or its verified email), never from an email the client sends with it.
- **Server-side image fetches** (`@wadzzo/storage`): http(s) only, no private or link-local addresses (including through redirects), size and time limits.
- **`authorizeCredentials`** parses its input with `authCredentialSchema`; malformed sign-ins fail with `WALLET_AUTH_FAILED`.

Known gap: Albedo login signs a token the _client_ chooses, so a captured signature can be replayed. Fixing it needs a server-issued nonce, which changes the mobile contract.

## Errors

Every deliberate failure is an `AppError` with a code from `@wadzzo/errors` (`ErrorCodes.WALLET_SIGNING_REJECTED`, `STELLAR_TRUSTLINE_MISSING`, ...). Each code fixes its HTTP status, tRPC code and a safe default message. The tRPC base procedure converts `AppError` to the matching `TRPCError` and adds `data.appCode` to the response, so clients can branch on a stable string. The mobile API keeps its wire contract (`{ error: { code, message } }` with tRPC code names); server-side failures there stay generic.

## White-label

See [PLATFORMS.md](PLATFORMS.md). `PLATFORM_SLUG` selects branding, theme and assets at build time and the `Platform` row at run time; rows are scoped by `@wadzzo/platform/scope`.

## Tests

Every shared package with logic has its own `vitest` suite (`pnpm test` runs them all through turbo): `errors` (codes and tRPC mapping), `wallet` (signer guard, login challenge, network config, Stellar error mapping, Apple sign-in), `auth`, `api` (guard through a real tRPC caller, bounty visibility), `storage` (URL guard, upload rules), `stellar` (account maths, prices), `platform` (scoping, stellar.toml escaping, Clinton assets present for every app), `geo`, `utils`.

## Deploying

- Web apps: one deployment per app per platform, same repo, different env (`PLATFORM_SLUG`, `NEXT_PUBLIC_STELLAR_NETWORK`, ...). Each app runs `sync:platform` before `dev`/`build`.
- `apps/express-wadzzo` is bundled with `tsup` (workspace packages inlined) and runs under PM2 (`ecosystem.config.cjs`).
- `.github/workflows`: `ci.yml` (format, typecheck, lint, test), `deploy-brand.yml`, `deploy-market.yml` (path-filtered, EC2).

## Conventions

- File names are kebab-case and say what the file does; functions are verbs.
- No duplicated components or helpers: if two apps need it, it lives in a package.
- `strict` TypeScript, Zod at boundaries, no bare `throw new Error` (lint warns).
- Dependencies are versions in the root `pnpm-workspace.yaml` catalog; packages ask for `catalog:`.
