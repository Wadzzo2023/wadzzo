import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { WalletType, custodialSignerSchema } from "@wadzzo/wallet/shared";

import type { TrpcContext } from "../context";
import {
  createCallerFactory,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "../trpc";

const router = createTRPCRouter({
  signSomething: protectedProcedure
    .input(z.object({ signWith: custodialSignerSchema }))
    .mutation(({ input }) => ({ signedWith: input.signWith })),
  noSigner: publicProcedure.input(z.object({ note: z.string() })).query(() => "ok"),
});
const createCaller = createCallerFactory(router);

const platform = { id: "wadzzo", isRoot: true } as TrpcContext["platform"];

function callerFor({
  user,
  admin = null,
}: {
  user: { id: string; email?: string | null; walletType: WalletType } | null;
  admin?: { platformId: string; platform: { isRoot: boolean } } | null;
}) {
  const findUnique = vi.fn().mockResolvedValue(admin);
  const session = user ? ({ user, expires: "2099-01-01" } as unknown as Session) : null;
  const db = { admin: { findUnique } } as unknown as TrpcContext["db"];
  return { caller: createCaller({ session, platform, db }), findUnique };
}

const fan = { id: "GFAN", email: "fan@example.com", walletType: WalletType.google };

describe("tRPC signer guard", () => {
  it("lets a custodial user sign for themselves", async () => {
    const { caller } = callerFor({ user: fan });
    await expect(caller.signSomething({ signWith: { email: "fan@example.com" } })).resolves.toEqual(
      {
        signedWith: { email: "fan@example.com" },
      },
    );
  });

  it("lets wallet users through with no signer", async () => {
    const { caller } = callerFor({
      user: { id: "GWALLET", email: null, walletType: WalletType.freighter },
    });
    await expect(caller.signSomething({ signWith: undefined })).resolves.toEqual({
      signedWith: undefined,
    });
  });

  it("refuses signing as someone else's custodial account", async () => {
    const { caller } = callerFor({ user: fan });
    await expect(
      caller.signSomething({ signWith: { email: "victim@example.com" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", cause: { code: "AUTH_FORBIDDEN" } });
  });

  it("refuses the platform signer for a signed-in non-admin", async () => {
    const { caller, findUnique } = callerFor({ user: fan, admin: null });
    await expect(caller.signSomething({ signWith: { isAdmin: true } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("allows the platform signer for an admin of this platform", async () => {
    const { caller } = callerFor({
      user: fan,
      admin: { platformId: "wadzzo", platform: { isRoot: true } },
    });
    await expect(caller.signSomething({ signWith: { isAdmin: true } })).resolves.toEqual({
      signedWith: { isAdmin: true },
    });
  });

  it("refuses an admin of a different, non-root platform", async () => {
    const { caller } = callerFor({
      user: fan,
      admin: { platformId: "clintoncounty", platform: { isRoot: false } },
    });
    await expect(caller.signSomething({ signWith: { isAdmin: true } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("asks anonymous callers to sign in", async () => {
    const { caller } = callerFor({ user: null });
    await expect(
      caller.signSomething({ signWith: { email: "fan@example.com" } }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("leaves procedures without signWith alone", async () => {
    const { caller, findUnique } = callerFor({ user: null });
    await expect(caller.noSigner({ note: "hi" })).resolves.toBe("ok");
    expect(findUnique).not.toHaveBeenCalled();
  });
});
