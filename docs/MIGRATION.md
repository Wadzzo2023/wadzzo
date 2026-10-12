# What moved where

| Before | Now |
| --- | --- |
| `brand-wadzzo`, `brand-clinton` | `apps/brand` (+ `PLATFORM_SLUG=clintoncounty`) |
| `wadzz0` | `apps/market` |
| `wadzzoAR`, `clintonAR` | `apps/ar` (+ `PLATFORM_SLUG=clintoncounty`) |
| `wadzzoWebAR-public` | `apps/mobile` |
| `package/express-wadzzo` submodule | `apps/express-wadzzo` |
| `package/connect_wallet` submodule | `packages/wallet` |
| three copies of `prisma/schema.prisma` | `packages/db` |
| `~/server/{platform,platform-scope,audit,notify}` | `@wadzzo/platform` |
| `~/components/shadcn/ui`, `~/ui/*` | `@wadzzo/ui` |
| `~/lib/stellar/account`, `quote`, `~/server/stellar/prices` | `@wadzzo/stellar` |
| `clientsign({ presignedxdr, pubkey, test })` | `signAndSubmitTransaction({ xdr, publicKey, walletType })` (network from config) |
| `NEXT_PUBLIC_STELLAR_PUBNET` | `NEXT_PUBLIC_STELLAR_NETWORK` (the old variable still works) |
| `WalletType.frieghter` | `WalletType.freighter` (stored value unchanged) |

## Behaviour changes worth knowing

- Apple custodial accounts can now sign on mainnet (the old `clientsign` fell through to `false`).
- A WalletConnect sign-in records `WalletType.walletConnect` (it recorded `rabet`, so later signing tried the Rabet extension).
- WalletConnect uses the chain of the configured network (it was always `stellar:pubnet`).
- `StellarAccount.create/createOrNull` are `loadOrThrow/load`; `getTokenBalance` is `tokenBalance`.
- Bandcoin / Actionverse special cases (share links, hashtag) are gone: platforms replace them.
- Express 5, helmet 8, express-rate-limit 8 and Prisma 7 in the task server: smoke-test it before its first deploy.
