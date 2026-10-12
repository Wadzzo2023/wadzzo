import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { requireEnv } from "@wadzzo/errors";

import { stellarNetwork } from "../config/stellar-network";

/** The tiny fee we charge in the challenge; the wallet signs it but it is never submitted. */
const CHALLENGE_PAYMENT_XLM = "0.000001";
const CHALLENGE_FEE = "200";

/**
 * The transaction a wallet signs to prove it owns `publicKey` (it is never
 * submitted). It pays a dust amount to the platform's mother account.
 */
export async function buildLoginChallengeXdr({
  publicKey,
}: {
  publicKey: string;
}): Promise<string> {
  const server = new Horizon.Server(stellarNetwork.horizonUrl);
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
    .setTimeout(0)
    .build()
    .toXDR();
}

/** True when `signedXdr` carries a valid signature from `publicKey`. */
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
