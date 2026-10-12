import type { Session } from "next-auth";
import { z } from "zod";

import { authorizeCredentials } from "@wadzzo/auth";
import { signEntryUpload } from "~/server/s3";
import { authCredentialSchema } from "@wadzzo/wallet/shared";

import type { Caller } from "./context";
import { followBrand } from "./follow";
import { HttpError, clientIp, rateLimit } from "./http";
import { signMobileToken } from "./token";

/**
 * ── /api/mobile/v1 route table ─────────────────────────────────────────────
 *
 * Every handler is thin on purpose: parse the path/query/body, then call the
 * existing tRPC procedure through `caller`. Validation, eligibility, the
 * geofence, tier gating and every fix already in the routers apply as-is.
 * Contract: wadzzoAR-mobile/docs/02-api.md.
 */

type Auth = "none" | "optional" | "required";

type Ctx = {
  req: Request;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  caller: Caller;
  session: Session | null;
};

type Route = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: Auth;
  handler: (ctx: Ctx) => Promise<unknown>;
};

const num = (v: string | undefined) => (v == null || v === "" ? undefined : Number(v));
const idParam = (ctx: Ctx, key: string) => {
  const n = Number(ctx.params[key]);
  if (!Number.isInteger(n)) throw new HttpError(400, "BAD_REQUEST", `Invalid ${key}`);
  return n;
};
const ip = clientIp;

const collectBody = z.object({ lat: z.number(), lng: z.number() });
const followBody = z.object({ signedXdr: z.string().min(1).optional() }).optional();
const uploadBody = z.object({
  kind: z.enum(["avatar", "cover"]),
  files: z
    .array(
      z.object({
        fileName: z.string().max(255),
        fileType: z.string().regex(/^image\//, "Only images can be used here"),
        fileSize: z
          .number()
          .int()
          .positive()
          .max(20 * 1024 * 1024),
        checksum: z.string().max(100),
      }),
    )
    .length(1),
});

export const ROUTES: Route[] = [
  // ── Auth ────────────────────────────────────────────────────────────────
  {
    method: "POST",
    path: "/auth/session",
    auth: "none",
    handler: async ({ req, body }) => {
      rateLimit(`signin:${ip(req)}`, 20, 60_000);
      const raw = z.record(z.string(), z.unknown()).parse(body);
      // Everything signed in through the app is marked as such, exactly as
      // the old app did with `fromAppSign: "true"`.
      const cred = authCredentialSchema.parse({ ...raw, fromAppSign: "true" });
      const user = await authorizeCredentials(cred);
      if (!user) throw new HttpError(401, "UNAUTHORIZED", "Couldn't sign you in");
      return {
        token: signMobileToken(user),
        user: {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          image: user.image ?? null,
          walletType: user.walletType,
          emailVerified: user.emailVerified,
        },
      };
    },
  },
  {
    method: "GET",
    path: "/auth/me",
    auth: "required",
    handler: ({ caller }) => caller.user.profile(),
  },
  // No server-side revocation by decision; kept so it can be added later
  // without an app update.
  {
    method: "DELETE",
    path: "/auth/session",
    auth: "required",
    handler: async () => ({ ok: true }),
  },

  // ── Me ──────────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/me/profile",
    auth: "required",
    handler: ({ caller }) => caller.user.profile(),
  },
  {
    method: "PATCH",
    path: "/me/profile",
    auth: "required",
    handler: ({ caller, body }) => caller.user.updateProfile(body as never),
  },
  {
    method: "DELETE",
    path: "/me",
    auth: "required",
    handler: ({ caller }) => caller.user.deleteAccount(),
  },
  {
    method: "GET",
    path: "/me/balance",
    auth: "required",
    handler: ({ caller }) => caller.user.platformBalance(),
  },
  {
    method: "GET",
    path: "/me/collection",
    auth: "required",
    handler: ({ caller, query }) =>
      caller.pins.collected({
        limit: num(query.limit),
        cursor: num(query.cursor),
        rarity: query.rarity as never,
        query: query.query,
        sort: query.sort as never,
      }),
  },
  {
    method: "GET",
    path: "/me/following",
    auth: "required",
    handler: ({ caller }) => caller.brands.followed(),
  },
  {
    method: "GET",
    path: "/me/bounties",
    auth: "required",
    handler: ({ caller }) => caller.bounty.mine(),
  },
  {
    method: "GET",
    path: "/me/bounty-attention",
    auth: "required",
    handler: ({ caller }) => caller.bounty.attention(),
  },

  // ── Pins ────────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/pins",
    auth: "optional",
    // `?lat=&lng=&radiusKm=` → only pins in that circle. Without them (older
    // app builds), every live pin, as before.
    handler: ({ caller, query }) =>
      caller.pins.list({
        lat: num(query.lat),
        lng: num(query.lng),
        radiusKm: num(query.radiusKm),
      }),
  },
  // Before /pins/:id — both are two segments and the first match wins.
  {
    method: "GET",
    path: "/pins/search",
    auth: "optional",
    handler: ({ caller, query }) =>
      caller.pins.search({
        q: query.q ?? "",
        lat: num(query.lat),
        lng: num(query.lng),
        limit: num(query.limit),
        brandId: query.brandId ? query.brandId : undefined,
      }),
  },
  {
    method: "GET",
    path: "/pins/:id",
    auth: "optional",
    handler: ({ caller, params }) => caller.pins.byId({ id: params.id! }),
  },
  {
    method: "POST",
    path: "/pins/:id/collect",
    auth: "required",
    handler: ({ caller, params, body, session }) => {
      rateLimit(`collect:${session!.user.id}`, 30, 60_000);
      const { lat, lng } = collectBody.parse(body);
      return caller.pins.collect({ locationId: params.id!, lat, lng });
    },
  },
  {
    method: "POST",
    path: "/pins/:id/collect-qr",
    auth: "required",
    handler: ({ caller, params, session }) => {
      rateLimit(`collect:${session!.user.id}`, 30, 60_000);
      return caller.pins.collectByQr({ locationId: params.id! });
    },
  },

  // ── Brands ──────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/brands",
    auth: "optional",
    handler: ({ caller }) => caller.brands.list(),
  },
  {
    method: "GET",
    path: "/brands/:id",
    auth: "optional",
    handler: ({ caller, params }) => caller.brands.byId({ id: params.id! }),
  },
  {
    method: "GET",
    path: "/brands/:id/pins",
    auth: "optional",
    handler: ({ caller, params, query }) =>
      caller.pins.byBrand({
        brandId: params.id!,
        tab: (query.tab as "live" | "yours" | undefined) ?? "live",
        limit: num(query.limit),
        cursor: num(query.cursor),
      }),
  },
  {
    method: "POST",
    path: "/brands/:id/follow",
    auth: "required",
    handler: ({ caller, session, params, body }) =>
      followBrand(caller, session!, params.id!, followBody.parse(body ?? undefined)?.signedXdr),
  },
  {
    method: "DELETE",
    path: "/brands/:id/follow",
    auth: "required",
    handler: ({ caller, params }) => caller.brands.unfollow({ brandId: params.id! }),
  },

  // ── Bounty ──────────────────────────────────────────────────────────────
  {
    method: "GET",
    path: "/bounties",
    auth: "optional",
    handler: ({ caller, query }) =>
      caller.bounty.list({
        filter: (query.filter as "open" | "ending" | "top" | undefined) ?? "open",
        // An empty ?search= means no search, not a search for "".
        search: query.search ? query.search : undefined,
        limit: num(query.limit) ?? 20,
        cursor: num(query.cursor) ?? null,
      }),
  },
  {
    method: "GET",
    path: "/bounties/:id",
    auth: "optional",
    handler: (c) => c.caller.bounty.byId({ id: idParam(c, "id") }),
  },
  {
    method: "POST",
    path: "/bounties/:id/join",
    auth: "required",
    handler: (c) => c.caller.bounty.join({ id: idParam(c, "id") }),
  },
  {
    method: "GET",
    path: "/bounties/:id/entries",
    auth: "required",
    handler: (c) => c.caller.bounty.entries({ bountyId: idParam(c, "id") }),
  },
  {
    method: "POST",
    path: "/bounties/:id/entries",
    auth: "required",
    handler: (c) =>
      c.caller.bounty.createEntry({
        ...(c.body as object),
        bountyId: idParam(c, "id"),
      } as never),
  },
  {
    method: "PATCH",
    path: "/entries/:entryId",
    auth: "required",
    handler: (c) =>
      c.caller.bounty.updateEntry({
        ...(c.body as object),
        entryId: idParam(c, "entryId"),
      } as never),
  },
  {
    method: "DELETE",
    path: "/entries/:entryId",
    auth: "required",
    handler: (c) => c.caller.bounty.deleteEntry({ entryId: idParam(c, "entryId") }),
  },
  {
    method: "POST",
    path: "/bounties/:id/uploads",
    auth: "required",
    handler: (c) =>
      c.caller.bounty.uploadUrls({
        ...(c.body as object),
        bountyId: idParam(c, "id"),
      } as never),
  },
  {
    method: "GET",
    path: "/bounties/:id/comments",
    auth: "optional",
    handler: (c) => c.caller.bounty.comments({ bountyId: idParam(c, "id") }),
  },
  {
    method: "POST",
    path: "/bounties/:id/comments",
    auth: "required",
    handler: (c) =>
      c.caller.bounty.addComment({
        ...(c.body as object),
        bountyId: idParam(c, "id"),
      } as never),
  },
  {
    method: "DELETE",
    path: "/comments/:commentId",
    auth: "required",
    handler: (c) => c.caller.bounty.deleteComment({ commentId: idParam(c, "commentId") }),
  },
  {
    method: "GET",
    path: "/bounties/:id/thread",
    auth: "required",
    handler: (c) => c.caller.bounty.thread({ bountyId: idParam(c, "id") }),
  },
  {
    method: "POST",
    path: "/bounties/:id/thread",
    auth: "required",
    handler: (c) =>
      c.caller.bounty.sendMessage({
        ...(c.body as object),
        bountyId: idParam(c, "id"),
      } as never),
  },

  // ── Events & announcements ──────────────────────────────────────────────
  {
    method: "GET",
    path: "/events",
    auth: "optional",
    handler: ({ caller, query }) =>
      caller.events.list({
        when: query.when === "past" ? "past" : "upcoming",
        following: query.following === "true",
        brandId: query.brandId ? query.brandId : undefined,
        limit: num(query.limit) ?? 20,
        cursor: query.cursor ? query.cursor : null,
      }),
  },
  {
    method: "GET",
    path: "/events/:id",
    auth: "optional",
    handler: (c) => c.caller.events.byId({ id: c.params.id! }),
  },
  {
    method: "POST",
    path: "/events/:id/rsvp",
    auth: "required",
    handler: (c) =>
      c.caller.events.rsvp({
        ...(c.body as object),
        id: c.params.id!,
      } as never),
  },
  {
    method: "GET",
    path: "/events/:id/comments",
    auth: "optional",
    handler: (c) => c.caller.events.comments({ kind: "event", id: c.params.id! }),
  },
  {
    method: "POST",
    path: "/events/:id/comments",
    auth: "required",
    handler: (c) =>
      c.caller.events.addComment({
        ...(c.body as object),
        target: { kind: "event", id: c.params.id! },
      } as never),
  },
  {
    method: "DELETE",
    path: "/event-comments/:commentId",
    auth: "required",
    handler: (c) =>
      c.caller.events.deleteComment({
        kind: "event",
        commentId: c.params.commentId!,
      }),
  },
  {
    method: "GET",
    path: "/announcements",
    auth: "optional",
    handler: ({ caller, query }) =>
      caller.events.announcements({
        following: query.following === "true",
        brandId: query.brandId ? query.brandId : undefined,
        limit: num(query.limit) ?? 20,
        cursor: query.cursor ? query.cursor : null,
      }),
  },
  {
    method: "GET",
    path: "/announcements/:id",
    auth: "optional",
    handler: (c) => c.caller.events.announcement({ id: c.params.id! }),
  },
  {
    method: "GET",
    path: "/announcements/:id/comments",
    auth: "optional",
    handler: (c) => c.caller.events.comments({ kind: "announcement", id: c.params.id! }),
  },
  {
    method: "POST",
    path: "/announcements/:id/comments",
    auth: "required",
    handler: (c) =>
      c.caller.events.addComment({
        ...(c.body as object),
        target: { kind: "announcement", id: c.params.id! },
      } as never),
  },
  {
    method: "DELETE",
    path: "/announcement-comments/:commentId",
    auth: "required",
    handler: (c) =>
      c.caller.events.deleteComment({
        kind: "announcement",
        commentId: c.params.commentId!,
      }),
  },

  // ── Murals + coins (docs/murals/plan.md §5.1) ──────────────────────────
  // Bodies are validated by the tRPC procedures themselves.
  {
    method: "GET",
    path: "/murals",
    auth: "optional",
    handler: ({ caller, query }) =>
      caller.murals.inArea({
        north: num(query.n)!,
        south: num(query.s)!,
        east: num(query.e)!,
        west: num(query.w)!,
        includeUnverified: query.unverified !== "false",
      }),
  },
  // Before /murals/:id — both are two segments and the first match wins.
  {
    method: "GET",
    path: "/murals/nearby",
    auth: "optional",
    handler: ({ caller, query }) =>
      caller.murals.nearby({ lat: num(query.lat)!, lng: num(query.lng)! }),
  },
  {
    method: "POST",
    path: "/murals/scans",
    auth: "required",
    handler: ({ caller, body }) => caller.murals.startScan(body as never),
  },
  {
    method: "POST",
    path: "/murals/scans/:id/submit",
    auth: "required",
    handler: ({ caller, params, body }) =>
      caller.murals.submitScan({
        ...(body as object),
        sessionId: params.id!,
      } as never),
  },
  {
    method: "GET",
    path: "/murals/:id",
    auth: "optional",
    handler: ({ caller, params }) => caller.murals.byId({ id: params.id! }),
  },
  {
    method: "PATCH",
    path: "/murals/:id",
    auth: "required",
    handler: ({ caller, params, body }) =>
      caller.murals.name({ ...(body as object), muralId: params.id! } as never),
  },
  {
    method: "GET",
    path: "/me/murals",
    auth: "required",
    handler: ({ caller, query }) =>
      caller.murals.mine({
        cursor: num(query.cursor) ?? 0,
        limit: num(query.limit) ?? 24,
      }),
  },
  {
    method: "GET",
    path: "/me/coins",
    auth: "required",
    handler: ({ caller }) => caller.coins.balance(),
  },
  {
    method: "GET",
    path: "/me/coins/history",
    auth: "required",
    handler: ({ caller, query }) =>
      caller.coins.history({
        cursor: query.cursor ? query.cursor : undefined,
        limit: num(query.limit) ?? 30,
      }),
  },

  // ── Uploads (profile images) ────────────────────────────────────────────
  {
    method: "POST",
    path: "/uploads/sign",
    auth: "required",
    handler: async ({ body }) => {
      const { files } = uploadBody.parse(body);
      return Promise.all(files.map((f) => signEntryUpload(f)));
    },
  },
];

export function matchRoute(method: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  let pathMatched = false;
  for (const route of ROUTES) {
    const pattern = route.path.split("/").filter(Boolean);
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = pattern.every((seg, i) => {
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = decodeURIComponent(parts[i]!);
        return true;
      }
      return seg === parts[i];
    });
    if (!ok) continue;
    pathMatched = true;
    if (route.method === method) return { route, params };
  }
  return pathMatched ? "method-not-allowed" : null;
}
