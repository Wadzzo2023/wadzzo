import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";

import type { TrpcContext } from "../context";
import { fanBountyRouter } from "../shared/bounty";
import { createCallerFactory } from "../trpc";

const createCaller = createCallerFactory(fanBountyRouter);

const wadzzo = { id: "wadzzo", isRoot: true } as TrpcContext["platform"];
const clinton = { id: "clintoncounty", isRoot: false } as TrpcContext["platform"];

function callerOn(
  platform: TrpcContext["platform"],
  bounty: object | null,
  session: Session | null = null,
) {
  const commentsFindMany = vi.fn().mockResolvedValue([]);
  const db = {
    bounty: { findUnique: vi.fn().mockResolvedValue(bounty) },
    bountyComment: { findMany: commentsFindMany },
  } as unknown as TrpcContext["db"];
  return { caller: createCaller({ session, platform, db }), commentsFindMany };
}

const approvedWadzzoBounty = { id: 1, platformId: "wadzzo", status: "APPROVED", participants: [] };

describe("fanBounty.comments", () => {
  it("shows an approved bounty's comments on its own platform", async () => {
    const { caller, commentsFindMany } = callerOn(wadzzo, approvedWadzzoBounty);
    await expect(caller.comments({ bountyId: 1 })).resolves.toEqual([]);
    expect(commentsFindMany).toHaveBeenCalledOnce();
  });

  it("hides another platform's bounty comments behind NOT_FOUND", async () => {
    const { caller, commentsFindMany } = callerOn(clinton, approvedWadzzoBounty);
    await expect(caller.comments({ bountyId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(commentsFindMany).not.toHaveBeenCalled();
  });

  it("hides comments of bounties that aren't approved from people who haven't joined", async () => {
    const { caller, commentsFindMany } = callerOn(wadzzo, {
      ...approvedWadzzoBounty,
      status: "PENDING",
    });
    await expect(caller.comments({ bountyId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(commentsFindMany).not.toHaveBeenCalled();
  });

  it("treats a bounty that doesn't exist the same way", async () => {
    const { caller } = callerOn(wadzzo, null);
    await expect(caller.comments({ bountyId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
