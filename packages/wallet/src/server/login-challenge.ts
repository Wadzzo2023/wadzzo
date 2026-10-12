import { Asset, Keypair, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import { requireEnv } from "@wadzzo/errors";

import { stellarNetwork } from "../config/stellar-network";
import { horizonServer } from "../stellar/horizon";

/** The tiny fee we charge in the challenge; the wallet signs it but it is never submitted. */
const CHALLENGE_PAYMENT_XLM = "0.000001";
const CHALLENGE_FEE = "200";
/** How long a signed challenge can be used to sign in. */
export const LOGIN_CHALLENGE_VALIDITY_SECONDS = 300;

const toStroops = (amount: string) => Math.round(Number(amount) * 1e7);

/**
 * The transaction a wallet signs to prove it owns `publicKey` (it is never
 * submitted). It pays a dust amount to the platform's mother account and is
 * only good for `LOGIN_CHALLENGE_VALIDITY_SECONDS`.
 */
export async function buildLoginChallengeXdr({
  publicKey,
}: {
  publicKey: string;
}): Promise<string> {
  const server = horizonServer();
  const motherAccount = Keypair.fromSecret(requireEnv("MOTHER_SECRET", process.env.MOTHER_SECRET));
  const source = await server.loadAccount(publicKey);

  return new TransactionBuilder(source, {
    fee: CHALLENGE_FEE,
    networkPassphrase: stellarNetwork.passphrase,
  })
    .addOperation(
      Operation.payment({
        amount: CHALLENGE_PAYMENT_XLM,
        source: publicKey,
        asset: Asset.native(),
        destination: motherAccount.publicKey(),
      }),
    )
    .setTimeout(LOGIN_CHALLENGE_VALIDITY_SECONDS)
    .build()
    .toXDR();
}

/**
 * True when `xdr` is a challenge *we* issued for `publicKey` (not just any
 * transaction the account once signed, which is public on the ledger) and is
 * signed by that key. Also false once the challenge has expired.
 */
export function verifyLoginChallenge({
  xdr,
  publicKey,
  now = new Date(),
}: {
  xdr: string;
  publicKey: string;
  now?: Date;
}): boolean {
  try {
    const transaction = new Transaction(xdr, stellarNetwork.passphrase);
    const motherPublicKey = Keypair.fromSecret(
      requireEnv("MOTHER_SECRET", process.env.MOTHER_SECRET),
    ).publicKey();

    const [operation] = transaction.operations;
    const isOurChallenge =
      transaction.source === publicKey &&
      transaction.operations.length === 1 &&
      operation?.type === "payment" &&
      operation.asset.isNative() &&
      operation.destination === motherPublicKey &&
      toStroops(operation.amount) === toStroops(CHALLENGE_PAYMENT_XLM) &&
      (operation.source === undefined || operation.source === publicKey);
    if (!isOurChallenge) return false;

    // An unbounded (maxTime 0) challenge could be replayed forever.
    const maxTime = Number(transaction.timeBounds?.maxTime ?? 0);
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (maxTime === 0 || nowSeconds > maxTime) return false;

    return verifyTransactionSignature({ xdr, publicKey });
  } catch (error) {
    console.error("[login] challenge verification failed", error);
    return false;
  }
}

/** True when `xdr` carries a valid signature from `publicKey` (says nothing about *what* was signed). */
export function verifyTransactionSignature({
  xdr,
  publicKey,
}: {
  xdr: string;
  publicKey: string;
}): boolean {
  try {
    const transaction = new Transaction(xdr, stellarNetwork.passphrase);
    const signer = Keypair.fromPublicKey(publicKey);
    const hash = transaction.hash();

    return transaction.signatures.some((decorated) => {
      // `signature` is a method in older SDKs and a property in newer ones.
      const raw = decorated.signature as unknown;
      const bytes = (
        typeof raw === "function" ? (raw as () => Buffer).call(decorated) : raw
      ) as Buffer;
      return signer.verify(hash, bytes);
    });
  } catch (error) {
    console.error("[login] signature verification failed", error);
    return false;
  }
}
