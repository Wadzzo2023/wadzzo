import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

process.loadEnvFile(".env.development");

const BRAND = "GCMTJCWDCE6AVBJMFCYIIPSLISCOTG3W62MMYKQOWBC2M4SJ65DEMUYK"; // Action Portal (dev), has a page token

describe("claim a page-token pin (testnet)", () => {
  it("offers the brand's page token, and says plainly when none is in stock", async () => {
    const { db } = await import("@wadzzo/db/server");
    const { quoteClaim } = await import("~/server/stellar/claim");
    const { claimOverview } = await import("~/server/stellar/claim");
    const kp = Keypair.random();
    const suffix = Math.random().toString(36).slice(2, 8);
    await db.user.create({ data: { id: kp.publicKey(), name: `e2e-${suffix}`, email: `e2e-${suffix}@example.test` } });
    const group = await db.locationGroup.create({
      data: {
        creatorId: BRAND, platformId: "wadzzo", pageAsset: true, title: `E2E page ${suffix}`, startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000),
        latitude: 0, longitude: 0, radius: 50, limit: 1, remaining: 0, approved: true,
        locations: { create: { latitude: 0, longitude: 0, autoCollect: false } },
      },
      include: { locations: true },
    });
    const loc = group.locations[0]!;
    const plain = await db.locationGroup.create({
      data: {
        creatorId: BRAND, platformId: "wadzzo", title: `E2E plain ${suffix}`, startDate: new Date(Date.now() - 86_400_000), endDate: new Date(Date.now() + 86_400_000),
        latitude: 0, longitude: 0, radius: 50, limit: 1, remaining: 0, approved: true,
        locations: { create: { latitude: 0, longitude: 0, autoCollect: false } },
      },
      include: { locations: true },
    });
    const consumer = await db.locationConsumer.create({ data: { userId: kp.publicKey(), locationId: loc.id, redeemCode: `P${suffix}`.toUpperCase(), claimedAt: new Date(), platformId: "wadzzo" } });
    const plainConsumer = await db.locationConsumer.create({ data: { userId: kp.publicKey(), locationId: plain.locations[0]!.id, redeemCode: `Q${suffix}`.toUpperCase(), claimedAt: new Date(), platformId: "wadzzo" } });
    const ctx = { db, platform: { id: "wadzzo", isRoot: true } };
    try {
      const overview = await claimOverview(ctx, kp.publicKey(), loc.id);
      console.log("PAGE overview", JSON.stringify(overview));
      expect(overview?.reward?.kind).toBe("page");
      const q = await quoteClaim(ctx, kp.publicKey(), consumer.id, "XLM");
      console.log("PAGE quote", JSON.stringify({ item: q.item?.name, ok: q.ok, source: q.source, problems: q.problems.map((p) => p.message) }));
      expect(q.item?.kind).toBe("page");

      const none = await claimOverview(ctx, kp.publicKey(), plain.locations[0]!.id);
      console.log("PLAIN overview", JSON.stringify(none));
      expect(none?.state).toBe("none");
      expect(none?.reward).toBeNull();
      expect(plainConsumer.id).toBeTruthy();
    } finally {
      await db.locationConsumer.deleteMany({ where: { userId: kp.publicKey() } });
      await db.locationGroup.deleteMany({ where: { id: { in: [group.id, plain.id] } } });
      await db.user.delete({ where: { id: kp.publicKey() } });
    }
  });
});
