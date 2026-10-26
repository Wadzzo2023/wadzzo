# Contributing

## Branches

```
feature branch ─PR─▶ develop ─(check the dev-* domains)─▶ main ─▶ production
```

- `main` is production. Every push to it deploys the web apps on Vercel (only the projects whose app or packages changed) and, when the task server changed, `apps/express-wadzzo` to EC2.
- `develop` is the shared staging branch (testnet, development database).
- Work on a short-lived branch named `<type>/<what>`, for example `fix/bounty-crash` or `feat/market-search`, and open a pull request.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, written in the imperative and under ~72 characters.

| Type       | For                                    |
| ---------- | -------------------------------------- |
| `feat`     | a new user-visible capability          |
| `fix`      | a bug fix                              |
| `refactor` | a code change with no behaviour change |
| `chore`    | tooling, dependencies, housekeeping    |
| `docs`     | documentation only                     |
| `test`     | tests only                             |

The scope is the app or package: `market`, `brand`, `ar`, `express`, `mobile`, `api`, `ui`, `stellar`, ...

## Before you open a pull request

```bash
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

CI runs the same checks plus a secret scan, and `main` / `develop` only accept a green build.

- **Shared code goes in `packages/`**, never copied between apps. Look in `packages/ui`, `packages/utils` and `packages/api` before writing something new.
- **White-label platforms are configuration** (`packages/platform`). Never branch on a platform name in app code; read the platform's config instead.
- **Errors** are `AppError` with a code from `@wadzzo/errors`.
- **Env vars**: add new ones to the app's `.env.example` (with a comment) and to every Vercel project that runs the app. Real `.env*` files are never committed.
- **Database**: the schema is `packages/db/prisma/schema.prisma`, shared by every app and the task server. Say in the pull request how the change reaches each database.

See [docs/RUNBOOK.md](docs/RUNBOOK.md) for day-to-day commands and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit.
