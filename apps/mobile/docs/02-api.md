# 02 · API — `/api/mobile/v1` on wadzzoAR

The app talks only to wadzzoAR. Everything in this file is **new work in the
wadzzoAR repo**; the mobile repo only consumes it.

## How it's built (server side)

```
wadzzoAR/src/
  pages/api/mobile/v1/[...route].ts   # one catch-all Next API route
  server/mobile/
    router.ts        # route table: METHOD + path pattern → handler
    context.ts       # Bearer token → { session, db }  (same shape tRPC expects)
    token.ts         # sign/verify mobile session JWT (jose, HS256)
    errors.ts        # TRPCError → HTTP status + { error: { code, message } }
    handlers/*.ts    # thin: parse params → appRouter.createCaller(ctx).x.y(input)
```

- **Reuse, don't re-implement.** Each handler calls the existing tRPC
  procedure through `createCaller`, so validation, eligibility, geofence,
  tier gating, and the bug fixes already in `pins.ts` / `brands.ts` /
  `bounty.ts` apply unchanged.
- **Session.** `ctx.session.user` is built from the verified Bearer token, the
  same `{ id, walletType, emailVerified, email }` NextAuth puts on its JWT, so
  `protectedProcedure` works as-is.
- **Auth logic is shared, not copied.** The body of `authorize()` in
  `server/auth.ts` moves into `server/auth/credentials.ts` and is called by
  both NextAuth (web) and `POST /auth/session` (mobile).
- **Versioned.** `v1` never breaks. App-store builds can't be force-updated;
  a breaking change ships as `v2` next to `v1`.
- **Errors.** `{ "error": { "code": "FORBIDDEN", "message": "Follow this brand to unlock" } }`.
  Messages are written to be shown verbatim, same as on the web.
- **Dates** are ISO strings. No superjson on this API.
- **Rate limits** on `/auth/*` and `collect*` (per IP + per user).
- **CORS** off (native clients don't need it).

## Auth

| Method | Path | Auth | Body → Response |
|---|---|---|---|
| POST | `/auth/session` | – | One of the credential shapes below → `{ token, expiresAt, user }` |
| GET | `/auth/me` | ✓ | → `{ user }` |
| DELETE | `/auth/session` | ✓ | No-op on the server (no revocation, by decision); the app clears its token. Kept so revocation can be added later without an app change. |
| DELETE | `/me` | ✓ | **Account deletion** (App Store rule 5.1.1(v)). Mirrors wadzz0 `api/game/user/delete-user`. |

Not a wadzzoAR endpoint, but part of sign-in: the app itself calls the
accounts service's `GET /api/account_xdr?email=` after email/Google/Apple
sign-in and ignores the result (see 03-auth).

Credential shapes (same union the web's NextAuth accepts, `fromAppSign: "true"` always set):

```ts
{ walletType: "emailPass", email, password }
{ walletType: "google",   email, token /* Firebase ID token */ }
{ walletType: "apple",    email, token? /* Firebase ID token */, appleToken? }
{ walletType: "albedo",   pubkey, signature, token /* signed message */ }
```

Token: JWT signed with `MOBILE_JWT_SECRET`, **no expiry and no server-side
revocation** (decided 2026-09-26; the risk that a leaked token works forever
was accepted). Guard that still applies: `context.ts` loads the `User` row on
every authed request and rejects the token if the user no longer exists, so
**account deletion does cut access**. Rotating `MOBILE_JWT_SECRET` signs
everyone out — the only kill switch.

## Profile

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/me/profile` | ✓ | name, bio, avatar, cover, joinedAt, counts |
| PATCH | `/me/profile` | ✓ | name, bio, avatarUrl, coverUrl (URLs must be our S3). New — the web has no profile editing. |
| GET | `/me/balance` | ✓ | → `user.platformBalance` |

## Pins

| Method | Path | Auth | → tRPC |
|---|---|---|---|
| GET | `/pins` | optional | `pins.list`. Signed-out gets public pins; signed-in adds tier/private + `collected`/`locked`. |
| GET | `/pins/search?q=&lat=&lng=&limit=` | optional | `pins.search` — every live drop (not just the loaded area), matched on title / brand / description / tags, each word must match, best match first; one result per drop (nearest point to `lat`/`lng`). `q` ≥ 2 chars, `limit` ≤ 30. |
| GET | `/pins/:id` | optional | new `pins.byId` (web currently finds it in the list) |
| GET | `/brands/:id/pins?tab=live\|yours&cursor=` | optional | `pins.byBrand` |
| GET | `/me/collection?cursor=&query=&sort=` | ✓ | `pins.collected` |
| POST | `/pins/:id/collect` | ✓ | `pins.collect` `{ lat, lng }` — server geofence applies |
| POST | `/pins/:id/collect-qr` | ✓ | `pins.collectByQr` |

## Brands

| Method | Path | Auth | → tRPC |
|---|---|---|---|
| GET | `/brands` | optional | `brands.list` |
| GET | `/brands/:id` | optional | new `brands.byId` |
| GET | `/me/following` | ✓ | `brands.followed` |
| POST | `/brands/:id/follow` | ✓ | see below |
| DELETE | `/brands/:id/follow` | ✓ | `brands.unfollow` |

**Follow** is a trustline, not a bookmark (see wadzzoAR memory notes). On the
app it collapses to one call for custodial accounts:

1. Server runs `followXdr`. If `alreadyTrusted` → write the row, return `{ followed: true }`.
2. Custodial wallet (email / Google / Apple): the XDR is already co-signed
   server-side (`WithSing`); the server **submits it itself**, verifies the
   trustline, writes the row → `{ followed: true }`.
3. Albedo wallet: returns `{ needsSignature: true, xdr }`. The app has Albedo
   sign it (`tx` intent), then calls `POST /brands/:id/follow` again with
   `{ signedXdr }`; the server submits and writes the row.

## Bounty

Mirrors `bounty.*` one-to-one.

| Method | Path | Auth |
|---|---|---|
| GET | `/bounties?filter=open\|ending\|top&search=&cursor=` | optional |
| GET | `/me/bounties` | ✓ |
| GET | `/bounties/:id` | optional |
| POST | `/bounties/:id/join` | ✓ |
| GET · POST | `/bounties/:id/entries` | ✓ |
| PATCH · DELETE | `/entries/:entryId` | ✓ |
| POST | `/bounties/:id/uploads` | ✓ presigned S3 PUTs |
| GET · POST | `/bounties/:id/comments` | GET optional / POST ✓ |
| DELETE | `/comments/:commentId` | ✓ |
| GET · POST | `/bounties/:id/thread` | ✓ |
| GET | `/me/bounty-attention` | ✓ |

## Events & announcements

Public — browsable signed out. Posted by brands from brand-wadzzo's Events
page; live on save (no approval). Dates are ISO strings. Router:
`server/api/routers/events.ts`.

| Method | Path | Auth |
|---|---|---|
| GET | `/events?when=upcoming\|past&following=true&brandId=&limit=&cursor=` | optional (`following` needs ✓) |
| GET | `/events/:id` | optional |
| POST | `/events/:id/rsvp` `{ going: boolean }` → `{ going, goingCount }` | ✓ |
| GET · POST | `/events/:id/comments` (`{ content }`) | GET optional / POST ✓ |
| DELETE | `/event-comments/:commentId` | ✓ (author or owning brand) |
| GET | `/announcements?following=true&brandId=&limit=&cursor=` | optional |
| GET | `/announcements/:id` (404 once expired) | optional |
| GET · POST | `/announcements/:id/comments` (`{ content }`) | GET optional / POST ✓ |
| DELETE | `/announcement-comments/:commentId` | ✓ (author or owning brand) |

"Upcoming" = not yet ended. RSVP respects `capacity` (409 "This event is
full"). Add-to-calendar is plain HTTP outside `/api/mobile/v1`:
`GET /api/events/:id/ics` → `text/calendar`.

## Uploads

`POST /uploads/sign` `{ kind: "avatar"|"cover"|"entry", files: [{ fileName, fileType, fileSize, checksum }] }`
→ `[{ uploadUrl, fileUrl }]`. Same presigner and bucket as the web
(`server/s3.ts`), hex SHA-256 checksum, `Content-Type`-only PUT.

## Server-side checklist (wadzzoAR)

- [ ] Extract `authorize()` → `server/auth/credentials.ts`; NextAuth calls it unchanged.
- [ ] `MOBILE_JWT_SECRET` env. No schema change (no revocation). Context checks the user row exists per request.
- [ ] Catch-all route + route table + error mapping.
- [ ] `pins.byId`, `brands.byId` procedures (useful on web too).
- [ ] Follow: server-side submit for custodial wallets.
- [ ] Profile read/update + account deletion.
- [ ] Rate limiting.
- [ ] Contract tests: one per endpoint, signed-out and signed-in.
