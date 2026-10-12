import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { env } from "../../../../env";
import { PLATFORM_ASSET, PLATFORM_FEE, STROOP, networkPassphrase } from "@wadzzo/wallet/config";
import { StellarAccount } from "@wadzzo/stellar/account";
import { type CustodialSigner } from "@wadzzo/wallet/shared";
import { signXdrForCustodialUser } from "@wadzzo/wallet/server";
import { type MyAssetType } from "@wadzzo/schemas/stellar-account";
import { horizonServer } from "@wadzzo/wallet/stellar";

const log = console;
// transection variables

export async function getClawbackAsPayment({
  userPubkey,
  assetInfo,
  price,
  creatorId,
  creatorStorageSec,
  signWith,
}: {
  userPubkey: string;
  assetInfo: MyAssetType;
  price: string;
  creatorId: string;
  creatorStorageSec: string;
  signWith: CustodialSigner;
}) {
  const server = horizonServer();

  const creatorStorageAcc = Keypair.fromSecret(creatorStorageSec);
  const asset = new Asset(assetInfo.code, assetInfo.issuer);

  const motherAccount = Keypair.fromSecret(env.MOTHER_SECRET);

  const transactionInializer = await server.loadAccount(userPubkey);

  // For a Tier User can have already trustline
  // So first have to sure that trusline exist and then send 0.5 xlm to storage.
  const creatorStorageBal = await StellarAccount.loadOrThrow(userPubkey);
  const hasTrust = creatorStorageBal.hasTrustline(asset.code, asset.issuer);

  const Tx1 = new TransactionBuilder(transactionInializer, {
    fee: "200",
    networkPassphrase,
  });

  if (!hasTrust) {
    Tx1.addOperation(
      Operation.changeTrust({
        asset,
        source: userPubkey,
      }),
    );
  }
  // 0
  Tx1.addOperation(
    Operation.payment({
      destination: userPubkey,
      amount: STROOP,
      asset,
      source: creatorStorageAcc.publicKey(),
    }),
  )
    // pay the creator the price amount
    .addOperation(
      Operation.payment({
        amount: price,
        asset: PLATFORM_ASSET,
        destination: creatorId,
      }),
    )
    // sending platform fee.
    .addOperation(
      Operation.payment({
        amount: PLATFORM_FEE,
        asset: PLATFORM_ASSET,
        destination: motherAccount.publicKey(),
      }),
    )

    .setTimeout(0);

  const buildTrx = Tx1.build();

  buildTrx.sign(creatorStorageAcc);

  const xdr = buildTrx.toXDR();
  const singedXdr = signXdrForCustodialUser({ xdr, signWith });

  return singedXdr;
}
