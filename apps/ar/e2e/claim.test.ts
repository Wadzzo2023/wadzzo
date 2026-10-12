import { Asset, Horizon, Keypair, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

process.loadEnvFile(".env.development");

const BRAND = "GCMTJCWDCE6AVBJMFCYIIPSLISCOTG3W62MMYKQOWBC2M4SJ65DEMUYK"; // Action Portal (dev)
const ASSET_ID = 12; // LSTP, open edition, issuer live

describe("claim to wallet (testnet)", () => {
  it("quotes, delivers by minting, and settles", async () => {
    const { db } = await import("@wadzzo/db/server");
    const { quoteClaim, prepareClaim, settleClaim } =
      await import("@wadzzo/api/ar/server/stellar/claim");
    const server = new Horizon.Server("https://horizon-testnet.stellar.org");

    // a throwaway collector
    const kp = Keypair.random();
    const fb = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
    expect(fb.ok).toBe(true);
    for (let i = 0; i < 20; i++) {
      try {
        await server.loadAccount(kp.publicKey());
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    const suffix = Math.random().toString(36).slice(2, 8);
    await db.user.create({
      data: {
        id: kp.publicKey(),
        name: `e2e-${suffix}`,
        email: `e2e-${suffix}@example.test`,
      },
    });
    const group = await db.locationGroup.create({
      data: {
        creatorId: BRAND,
        platformId: "wadzzo",
        assetId: ASSET_ID,
        title: `E2E claim ${suffix}`,
        startDate: new Date(Date.now() - 86_400_000),
        endDate: new Date(Date.now() + 86_400_000),
        latitude: 0,
        longitude: 0,
        radius: 50,
        limit: 1,
        remaining: 0,
        approved: true,
        locations: {
          create: { latitude: 0, longitude: 0, autoCollect: false },
        },
      },
      include: { locations: true },
    });
    const loc = group.locations[0]!;
    const consumer = await db.locationConsumer.create({
      data: {
        userId: kp.publicKey(),
        locationId: loc.id,
        redeemCode: `E2E${suffix}`.toUpperCase(),
        claimedAt: new Date(),
        platformId: "wadzzo",
      },
    });
    const ctx = { db, platform: { id: "wadzzo", isRoot: true } };

    try {
      const q = await quoteClaim(ctx, kp.publicKey(), consumer.id, "XLM");
      console.log(
        "QUOTE",
        JSON.stringify({
          ok: q.ok,
          source: q.source,
          total: q.total,
          currency: q.currency,
          lines: q.lines.map((l) => `${l.label}=${l.amount}`),
          problems: q.problems.map((p) => p.message),
        }),
      );
      expect(q.ok).toBe(true);

      const prep = await prepareClaim(ctx, {
        userId: kp.publicKey(),
        consumerId: consumer.id,
        method: "XLM",
        signWith: undefined,
      });
      expect(prep.ok).toBe(true);
      if (!prep.ok) return;
      const tx = TransactionBuilder.fromXDR(prep.xdr, Networks.TESTNET);
      tx.sign(kp);
      const res = await server.submitTransaction(tx);
      console.log("SUBMITTED", res.hash);

      const settled = await settleClaim(db, prep.txId);
      console.log("SETTLED", settled?.status, settled?.error);
      expect(settled?.status).toBe("SUCCESS");

      const asset = await db.asset.findUniqueOrThrow({
        where: { id: ASSET_ID },
      });
      const acc = await server.loadAccount(kp.publicKey());
      const held = acc.balances.find(
        (b) =>
          b.asset_type !== "native" &&
          "asset_code" in b &&
          b.asset_code === asset.code &&
          b.asset_issuer === asset.issuer,
      );
      console.log("HELD", held && "balance" in held ? held.balance : null);
      expect(Number(held && "balance" in held ? held.balance : 0)).toBe(1);

      const after = await quoteClaim(ctx, kp.publicKey(), consumer.id, "XLM");
      console.log(
        "AFTER",
        after.state,
        after.problems.map((p) => p.message),
      );
      expect(after.state).toBe("delivered");
      const owned = await db.user_Asset.count({
        where: { userId: kp.publicKey(), assetId: ASSET_ID },
      });
      expect(owned).toBe(1);
    } finally {
      // clean up the test rows (the on-chain copy stays, it's testnet)
      await db.locationConsumer.updateMany({
        where: { id: consumer.id },
        data: { claimTxId: null },
      });
      await db.assetTransaction.deleteMany({
        where: { buyerId: kp.publicKey() },
      });
      await db.user_Asset.deleteMany({ where: { userId: kp.publicKey() } });
      await db.locationConsumer.deleteMany({ where: { id: consumer.id } });
      await db.locationGroup.delete({ where: { id: group.id } });
      await db.user.delete({ where: { id: kp.publicKey() } });
    }
  });
});
