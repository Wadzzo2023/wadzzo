## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Apps affected

- [ ] market (app.wadzzo.com)
- [ ] brand (brand.wadzzo.com, clintonadmin.wadzzo.com)
- [ ] ar (web.wadzzo.com, clinton.wadzzo.com)
- [ ] express-wadzzo (task server)
- [ ] mobile
- [ ] shared packages only

## Checks

- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass
- [ ] Prisma schema changed? Migration / `db push` plan noted below
- [ ] New env var? Added to the app's `.env.example` and to the Vercel projects
- [ ] Checked on both platforms (Wadzzo and Clinton County) if UI changed
