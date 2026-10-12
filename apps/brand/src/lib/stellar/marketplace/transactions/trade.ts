import { type Asset, BASE_FEE, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { STORAGE_SECRET } from "../../platform-secrets";
import { type CustodialSigner } from "@wadzzo/wallet/shared";
import { signXdrForCustodialUser } from "@wadzzo/wallet/server";
import { networkPassphrase, TrxBaseFee } from "@wadzzo/wallet/config";
import { horizonServer } from "@wadzzo/wallet/stellar";

export async function tradeAssetXDR(props: {
  sellingAsset: Asset;
  buyingAsset: Asset;
  amount: string;
  price: string;
  creatorStorageSecret: string;
  pubkey: string;
  signWith: CustodialSigner;
}) {
  // take siteAsset and send xlm from storage
  const { amount, buyingAsset, price, sellingAsset, creatorStorageSecret, pubkey, signWith } =
    props;

  // const creatorStorage = Keypair.fromSecret(creatorStorageSecret);

  const server = horizonServer();

  const storageAcc = Keypair.fromSecret(STORAGE_SECRET);
  //   const pubAcc = Keypair.fromSecret(secret);

  const transactionInializer = await server.loadAccount(pubkey);

  const Tx = new TransactionBuilder(transactionInializer, {
    fee: BASE_FEE,
    networkPassphrase,
  })

    //
    // TODO: pay pubkey the transection fee
    .addOperation(
      Operation.manageSellOffer({
        amount,
        buying: buyingAsset,
        price,
        selling: sellingAsset,
        // source: creatorStorage.publicKey(),
      }),
    )

    .setTimeout(0)
    .build();

  // Tx.sign(creatorStorage);

  const xdr = Tx.toXDR();

  const signedXDR = await signXdrForCustodialUser({
    xdr: xdr,
    signWith: signWith,
  });

  return signedXDR;
}

export async function buyOfferXDR(props: {
  sellingAsset: Asset;
  buyingAsset: Asset;
  amount: string;
  price: string;
  creatorStorageSecret?: string;
  pubkey: string;
  signWith: CustodialSigner;
}) {
  // take siteAsset and send xlm from storage
  const { amount, buyingAsset, price, sellingAsset, creatorStorageSecret, pubkey, signWith } =
    props;

  // const creatorStorage = Keypair.fromSecret(creatorStorageSecret);

  const server = horizonServer();

  const storageAcc = Keypair.fromSecret(STORAGE_SECRET);
  //   const pubAcc = Keypair.fromSecret(secret);

  const transactionInializer = await server.loadAccount(pubkey);

  const Tx = new TransactionBuilder(transactionInializer, {
    fee: TrxBaseFee,
    networkPassphrase,
  })

    //
    // TODO: pay pubkey the transection fee
    .addOperation(
      Operation.manageBuyOffer({
        buying: buyingAsset,
        price,
        selling: sellingAsset,
        buyAmount: amount,
        // source: creatorStorage.publicKey(),
      }),
    )

    .setTimeout(0)
    .build();

  // Tx.sign(creatorStorage);

  const xdr = Tx.toXDR();

  const signedXDR = await signXdrForCustodialUser({
    xdr: xdr,
    signWith: signWith,
  });

  return signedXDR;
}
