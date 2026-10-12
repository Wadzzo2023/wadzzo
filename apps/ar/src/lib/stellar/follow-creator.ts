import {
  Asset,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { env } from "~/env";
import { STELLAR_URL, networkPassphrase } from "@wadzzo/wallet/config";
import { signXdrForCustodialUser } from "@wadzzo/wallet/server";
import { type CustodialSigner } from "@wadzzo/wallet/shared";

/**
 * ── Follow, on-chain ───────────────────────────────────────────────────────
 *
 * Ported from the main webapp's `lib/stellar/fan/follow_creator.ts`.
 *
 * Following a brand in Wadzzo is not just a database row — it's a **trustline**
 * to that brand's page asset. That's what makes the rest of the tier system
 * possible: you can't be sent a creator's token, and so can't clear any of
 * their tiers, without trusting the asset first. The `Follow` row is the
 * bookkeeping; this is the thing that actually happens.
 *
 * Two operations, in one transaction built and paid for by the mother account:
 *
 *  1. Mother pays the user 0.5 XLM. A trustline raises an account's minimum
 *     balance reserve, so a user with a thin balance would simply fail to
 *     create one. The platform covers it rather than letting "Follow" fail
 *     for people with no XLM.
 *  2. `changeTrust`, sourced from the user — which is why the transaction
 *     still needs the user's signature even though mother built and paid.
 *
 * `signXdrForCustodialUser` co-signs for custodial wallets (email/social logins, where the
 * platform holds the key); self-custody wallets get the XDR back to sign in
 * their own wallet.
 */
export async function buildFollowTrustlineXdr({
  userPubkey,
  creatorPageAsset,
  signWith,
}: {
  userPubkey: string;
  creatorPageAsset: { code: string; issuer: string };
  signWith: CustodialSigner;
}) {
  const server = new Horizon.Server(STELLAR_URL);
  const asset = new Asset(creatorPageAsset.code, creatorPageAsset.issuer);
  const motherAccount = Keypair.fromSecret(env.MOTHER_SECRET);

  // Sequence comes from mother, not the user — mother is the transaction's
  // source account and the one paying the fee.
  const transactionInitializer = await server.loadAccount(
    motherAccount.publicKey(),
  );

  const tx = new TransactionBuilder(transactionInitializer, {
    fee: "200",
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: userPubkey,
        asset: Asset.native(),
        amount: "0.5",
      }),
    )
    .addOperation(
      Operation.changeTrust({
        asset,
        source: userPubkey,
      }),
    )
    .setTimeout(0)
    .build();

  tx.sign(motherAccount);

  return signXdrForCustodialUser({ xdr: tx.toXDR(), signWith });
}

/**
 * Custodial wallets have no on-device key — the platform fetches their secret
 * by email and co-signs server-side. Self-custody wallets sign in the wallet
 * itself, so they get the XDR back untouched (`signXdrForCustodialUser` no-ops on
 * `undefined`).
 *
 * Deriving this from the session rather than taking it from the client, which
 * is what the reference tRPC procedure does: `signWith` decides whose key
 * signs, and that is not a claim a client should get to make.
 */
export function signWithFor(session: {
  user: { walletType?: string | null; email?: string | null };
}): CustodialSigner {
  const custodial = ["emailPass", "google", "facebook", "apple"];
  const { walletType, email } = session.user;
  if (walletType && custodial.includes(walletType) && email) {
    return { email };
  }
  return undefined;
}

/**
 * A creator's page asset, whether they minted one through the platform
 * (`pageAsset`) or pointed at an existing asset (`customPageAssetCodeIssuer`,
 * stored as a `code-issuer-price-priceUSD` string).
 */
export function creatorAsset(creator: {
  pageAsset: { code: string; issuer: string } | null;
  customPageAssetCodeIssuer: string | null;
}): { code: string; issuer: string } | null {
  if (creator.pageAsset) return creator.pageAsset;

  if (creator.customPageAssetCodeIssuer) {
    const [code, issuer] = creator.customPageAssetCodeIssuer.split("-");
    if (code && issuer && issuer.length === 56) return { code, issuer };
  }

  return null;
}
