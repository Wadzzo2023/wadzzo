# Wadzzo AR

Collect brand drops (pins) on a map and in AR. This repo is the web app and the API behind the native mobile app.

## Run it

```bash
pnpm install        # also runs prisma generate
cp .env.development .env   # or set the variables listed in src/env.js
pnpm dev            # http://localhost:3000 (webpack)
```

`git submodule update --init` first if `package/connect_wallet` is empty (it tracks branch `wadzzo-appRouter`).

| Script | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next with webpack |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | Vitest |
| `pnpm db:generate` | Regenerate the Prisma client after the schema changes |

## How it fits with the other apps

- **brand-wadzzo** owns the database schema and the brand portal. `prisma/schema.prisma` here is a copy; do not push the schema from this repo.
- **wadzz0** is the fan app (wallet, marketplace, bounties).
- **wadzzoWebAR-public** is the mobile app; it calls `/api/mobile/v1`. That contract must not change.

## Layout

```
src/app/(shell)     phone-frame screens (map, collection, bounties, …)
src/app/(bare)      screens without the frame (/albedo, /embed/[id])
src/app/api         route handlers (tRPC, auth, mobile v1, …)
src/server          tRPC routers, mobile API, Stellar helpers, notifications
src/lib             client + shared helpers (navigation shim, AR math, Stellar)
package/connect_wallet   shared wallet-connect UI (git submodule)
docs/               map style and mural notes
```

## Environment

Required server variables include `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `MOBILE_JWT_SECRET`, `MOTHER_SECRET`, `STORAGE_SECRET`, and `ISSUER_ENCRYPTION_KEY` (must match the key wadzz0 and brand-wadzzo use, because issuer keys are stored encrypted in the shared database). See `src/env.js` for the full list and the optional ones.
