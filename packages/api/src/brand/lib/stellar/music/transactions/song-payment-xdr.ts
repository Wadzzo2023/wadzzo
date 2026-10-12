import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { networkPassphrase } from "./create-song-token";
import { type CustodialSigner } from "@wadzzo/wallet/shared";
import { signXdrForCustodialUser } from "@wadzzo/wallet/server";
import {
  PLATFORM_ASSET,
  PLATFORM_FEE,
  TrxBaseFee,
  TrxBaseFeeInPlatformAsset,
} from "@wadzzo/wallet/config";
import { env } from "../../../../../env";
import { StellarAccount } from "@wadzzo/stellar/account";
import { getplatformAssetNumberForXLM } from "../../fan/get-token-price";
import { horizonServer } from "@wadzzo/wallet/stellar";

const log = console;

export async function XDR4BuyAsset({
  signWith,
  code,
  issuerPub,
  buyer,
  price,
  storageSecret,
  seller,
}: {
  buyer: string;
  code: string;
  issuerPub: string;
  price: string;
  signWith: CustodialSigner;
  storageSecret: string;
  seller: string;
}) {
  // this asset limit only for buying more item.
  const asset = new Asset(code, issuerPub);
  const server = horizonServer();
  const storageAcc = Keypair.fromSecret(storageSecret);

  const motherAcc = Keypair.fromSecret(env.MOTHER_SECRET);

  const transactionInializer = await server.loadAccount(motherAcc.publicKey());

  const buyerAcc = await StellarAccount.loadOrThrow(buyer);
  const hasTrust = buyerAcc.hasTrustline(code, issuerPub);

  const requiredAsset2refundXlm = hasTrust ? 0 : await getplatformAssetNumberForXLM(0.5);
  const totalPlatformFee =
    requiredAsset2refundXlm + Number(PLATFORM_FEE) + Number(TrxBaseFeeInPlatformAsset);

  const Tx2 = new TransactionBuilder(transactionInializer, {
    fee: TrxBaseFee,
    networkPassphrase,
  });

  Tx2.addOperation(
    Operation.payment({
      destination: motherAcc.publicKey(),
      amount: totalPlatformFee.toString(),
      asset: PLATFORM_ASSET,
      source: buyer,
    }),
  );

  // pay price to seller
  if (Number(price) > 0) {
    Tx2.addOperation(
      Operation.payment({
        destination: seller,
        amount: price,
        asset: PLATFORM_ASSET,
        source: buyer,
      }),
    );
  }

  if (!hasTrust) {
    Tx2.addOperation(
      Operation.payment({
        destination: buyer,
        amount: "0.5",
        asset: Asset.native(),
        source: motherAcc.publicKey(),
      }),
    ).addOperation(
      Operation.changeTrust({
        asset: asset,
        source: buyer,
      }),
    );
  }

  // send token to buyer
  Tx2.addOperation(
    Operation.payment({
      asset: asset,
      amount: "1",
      source: storageAcc.publicKey(),
      destination: buyer,
    }),
  )

    // pay fee for platform
    .addOperation(
      Operation.payment({
        asset: PLATFORM_ASSET,
        amount: PLATFORM_FEE,
        destination: Keypair.fromSecret(env.MOTHER_SECRET).publicKey(),
      }),
    )
    .setTimeout(0);

  const buildTrx = Tx2.build();

  buildTrx.sign(motherAcc, storageAcc);

  const xdr = buildTrx.toXDR();
  const singedXdr = signXdrForCustodialUser({ xdr, signWith });
  return singedXdr;
}

export async function XDR4BuyAssetWithXLM({
  signWith,
  code,
  issuerPub,
  buyer,
  priceInNative,
  storageSecret,
  seller,
}: {
  buyer: string;
  code: string;
  issuerPub: string;
  priceInNative: string;
  signWith: CustodialSigner;
  storageSecret: string;
  seller: string;
}) {
  // this asset limit only for buying more item.
  const asset = new Asset(code, issuerPub);
  const server = horizonServer();
  const storageAcc = Keypair.fromSecret(storageSecret);

  const transactionInializer = await server.loadAccount(buyer);

  const balances = transactionInializer.balances;
  const trust = balances.find((balance) => {
    if (balance.asset_type === "credit_alphanum12" || balance.asset_type === "credit_alphanum4") {
      if (balance.asset_code === code && balance.asset_issuer === issuerPub) {
        return true;
      }
    }
  });

  const Tx2 = new TransactionBuilder(transactionInializer, {
    fee: TrxBaseFee,
    networkPassphrase,
  });

  if (Number(priceInNative) > 0) {
    // pay price to seller
    Tx2.addOperation(
      Operation.payment({
        destination: seller,
        amount: priceInNative,
        asset: Asset.native(),
        source: buyer,
      }),
    );
  }

  if (trust === undefined) {
    Tx2.addOperation(
      Operation.changeTrust({
        asset: asset,
        source: buyer,
      }),
    );
  }

  // send token to buyyer
  Tx2.addOperation(
    Operation.payment({
      asset: asset,
      amount: "1",
      source: storageAcc.publicKey(),
      destination: buyer,
    }),
  )

    // pay fee for platform
    .addOperation(
      Operation.payment({
        asset: Asset.native(),
        amount: "2",
        destination: Keypair.fromSecret(env.MOTHER_SECRET).publicKey(),
      }),
    )
    .setTimeout(0);

  const buildTrx = Tx2.build();

  buildTrx.sign(storageAcc);

  const xdr = buildTrx.toXDR();
  const singedXdr = signXdrForCustodialUser({ xdr, signWith });
  // console.log(singedXdr, "singedXdr");
  return singedXdr;
}

export async function XDR4BuyAssetWithSquire({
  signWith,
  code,
  issuerPub,
  buyer,
  price,
  storageSecret,
  seller,
}: {
  buyer: string;
  code: string;
  issuerPub: string;
  price: string;
  signWith: CustodialSigner;
  storageSecret: string;
  seller: string;
}) {
  // this asset limit only for buying more item.
  const asset = new Asset(code, issuerPub);
  const server = horizonServer();
  const storageAcc = Keypair.fromSecret(storageSecret);

  const mother = Keypair.fromSecret(env.MOTHER_SECRET);

  const transactionInializer = await server.loadAccount(mother.publicKey());

  const buyerAcc = await StellarAccount.loadOrThrow(buyer);
  const hasTrust = buyerAcc.hasTrustline(code, issuerPub);

  const Tx2 = new TransactionBuilder(transactionInializer, {
    fee: BASE_FEE,
    networkPassphrase,
  });

  if (Number(price) > 0) {
    Tx2
      // pay price to seller
      .addOperation(
        Operation.payment({
          destination: seller,
          amount: price,
          asset: PLATFORM_ASSET,
        }),
      );
  }

  if (!hasTrust) {
    Tx2.addOperation(
      Operation.payment({
        destination: buyer,
        amount: "0.5",
        asset: Asset.native(),
      }),
    );
    Tx2.addOperation(
      Operation.changeTrust({
        asset: asset,
        source: buyer,
      }),
    );
  }

  // send token to buyyer
  Tx2.addOperation(
    Operation.payment({
      asset: asset,
      amount: "1",
      source: storageAcc.publicKey(),
      destination: buyer,
    }),
  )

    .setTimeout(0);

  const buildTrx = Tx2.build();

  buildTrx.sign(storageAcc, mother);

  const xdr = buildTrx.toXDR();
  const singedXdr = signXdrForCustodialUser({ xdr, signWith });
  // console.log(singedXdr, "singedXdr");
  return singedXdr;
}
