import { Account, Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { stellarNetwork } from "../config/stellar-network";
import { verifyLoginChallenge, verifyTransactionSignature } from "../server/login-challenge";

const motherPublicKey = Keypair.fromSecret(process.env.MOTHER_SECRET!).publicKey();
const user = Keypair.random();
const stranger = Keypair.random();

const NOW = new Date("2026-01-01T12:00:00Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

/** A transaction shaped like the one `buildLoginChallengeXdr` issues, with knobs to break it. */
function challenge(
  overrides: {
    destination?: string;
    amount?: string;
    extraOperation?: boolean;
    timeBounds?: { minTime: number; maxTime: number };
    signer?: Keypair | null;
  } = {},
) {
  const builder = new TransactionBuilder(new Account(user.publicKey(), "100"), {
    fee: "200",
    networkPassphrase: stellarNetwork.passphrase,
    timebounds: overrides.timeBounds ?? { minTime: 0, maxTime: nowSeconds + 300 },
  });
  builder.addOperation(
    Operation.payment({
      source: user.publicKey(),
      asset: Asset.native(),
      amount: overrides.amount ?? "0.000001",
      destination: overrides.destination ?? motherPublicKey,
    }),
  );
  if (overrides.extraOperation) {
    builder.addOperation(
      Operation.payment({
        source: user.publicKey(),
        asset: Asset.native(),
        amount: "100",
        destination: stranger.publicKey(),
      }),
    );
  }
  const transaction = builder.build();
  const signer = overrides.signer === undefined ? user : overrides.signer;
  if (signer) transaction.sign(signer);
  return transaction.toXDR();
}

const verify = (xdr: string, publicKey = user.publicKey(), now = NOW) =>
  verifyLoginChallenge({ xdr, publicKey, now });

describe("verifyLoginChallenge", () => {
  it("accepts the challenge, signed by the account, while it is valid", () => {
    expect(verify(challenge())).toBe(true);
  });

  it("rejects it once it has expired", () => {
    const later = new Date(NOW.getTime() + 301_000);
    expect(verify(challenge(), user.publicKey(), later)).toBe(false);
  });

  it("rejects a challenge with no expiry (the old kind could be replayed forever)", () => {
    expect(verify(challenge({ timeBounds: { minTime: 0, maxTime: 0 } }))).toBe(false);
  });

  it("rejects a transaction the account signed for something else", () => {
    // e.g. a payment lifted from the public ledger
    expect(verify(challenge({ destination: stranger.publicKey(), amount: "250" }))).toBe(false);
    expect(verify(challenge({ amount: "5" }))).toBe(false);
    expect(verify(challenge({ extraOperation: true }))).toBe(false);
  });

  it("rejects an unsigned challenge and one signed by another key", () => {
    expect(verify(challenge({ signer: null }))).toBe(false);
    expect(verify(challenge({ signer: stranger }))).toBe(false);
  });

  it("rejects a challenge presented for a different account", () => {
    expect(verify(challenge(), stranger.publicKey())).toBe(false);
  });

  it("rejects garbage without throwing", () => {
    expect(verify("not-an-xdr")).toBe(false);
  });
});

describe("verifyTransactionSignature", () => {
  it("only checks who signed", () => {
    const xdr = challenge({ destination: stranger.publicKey(), amount: "250" });
    expect(verifyTransactionSignature({ xdr, publicKey: user.publicKey() })).toBe(true);
    expect(verifyTransactionSignature({ xdr, publicKey: stranger.publicKey() })).toBe(false);
  });
});
