# White-label platforms

A platform (Wadzzo, Clinton County, ...) is _configuration_, never a branch.

## What a platform consists of

| Piece        | Where                                               | Used for                                                                                                       |
| ------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Branding     | `packages/platform/src/branding/<slug>.ts`          | names, coin name, hashtag, URLs, colours, wordmark, toml defaults                                              |
| Theme        | `packages/platform/themes/<slug>/<app>.css`         | CSS variable overrides and fonts, loaded after the app's own CSS                                               |
| Assets       | `packages/platform/assets/<slug>/{shared,<app>}/**` | favicon, logo, mark, avatar; served from `/platform/...` (`shared` goes to every app, the app's own files win) |
| Database row | `Platform` table, `id = slug`                       | scoping, admins, audit, token                                                                                  |
| Env          | `PLATFORM_SLUG=<slug>` per deployment               | selects all of the above                                                                                       |

## Add a platform

1. `packages/platform/src/branding/<slug>.ts` implementing `PlatformBranding`; register it in `branding/index.ts`.
2. `themes/<slug>/{brand,ar,market}.css` (copy `clintoncounty/` and change values).
3. `assets/<slug>/shared/` (and per-app overrides in `assets/<slug>/{brand,ar,market}/`) with `favicon.ico`, `images/logo.png`, `images/loading.png`, `images/icons/avatar-icon.png`, `brand/brand-mark.png`. `pnpm --filter @wadzzo/platform test` fails if an app would be missing one of the files the branding points to.
4. Insert the `Platform` row (see `packages/db/prisma/sql/2026-10-07-multi-platform.sql`).
5. Deploy each app with `PLATFORM_SLUG=<slug>` and its own `NEXT_PUBLIC_*` values.

## How it is applied

- `pnpm sync:platform` (run by `predev`/`prebuild`) writes `src/styles/platform-theme.css` and `public/platform/**`. Both are generated and git-ignored.
- Code reads `platformBranding` from `@wadzzo/platform/branding`; there is no `if (slug === ...)` in components.
- Server code scopes queries with `platformScope(ctx)` and creates rows with `platformId` (guarded by `tests/platform-stamping.test.ts`).
