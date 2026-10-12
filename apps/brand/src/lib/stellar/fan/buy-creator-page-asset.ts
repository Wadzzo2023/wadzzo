import { Asset, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { type CustodialSigner } from "@wadzzo/wallet/shared";
import { signXdrForCustodialUser } from "@wadzzo/wallet/server";
import {
  PLATFORM_ASSET,
  PLATFORM_FEE,
  TrxBaseFee,
  TrxBaseFeeInPlatformAsset,
  networkPassphrase,
} from "@wadzzo/wallet/config";
import { env } from "~/env";
import { horizonServer } from "@wadzzo/wallet/stellar";

export const sendAssetXDRForAsset = async ({
  creatorId,
  priceWithCost,
  code,
  issuer,
  signWith,
  storageSecret,
  userPublicKey,
  totoalTokenToSend,
}: {
  creatorId: string;
  priceWithCost: number;
  code: string;
  issuer: string;
  signWith: CustodialSigner;
  storageSecret: string;
  userPublicKey: string;
  totoalTokenToSend: number;
}) => {
  const server = horizonServer();

  const asset = new Asset(code, issuer);

  const motherAccount = Keypair.fromSecret(env.MOTHER_SECRET);

  const assetStorage = Keypair.fromSecret(storageSecret);

  const transactionInializer = await server.loadAccount(motherAccount.publicKey());

  const Tx1 = new TransactionBuilder(transactionInializer, {
    fee: TrxBaseFee,
    networkPassphrase,
  });

  Tx1.addOperation(
    Operation.payment({
      destination: userPublicKey,
      asset: asset,
      amount: totoalTokenToSend.toFixed(7),
      source: assetStorage.publicKey(),
    }),
  );
  Tx1.addOperation(
    Operation.payment({
      destination: motherAccount.publicKey(),
      asset: PLATFORM_ASSET,
      amount: priceWithCost.toFixed(7),
      source: userPublicKey,
    }),
  );

  Tx1.setTimeout(0);
  const buildTrx = Tx1.build();

  buildTrx.sign(motherAccount, assetStorage);

  const xdr = buildTrx.toXDR();
  const singedXdr = signXdrForCustodialUser({ xdr, signWith });
  return singedXdr;
};

export const sendAssetXDRForNative = async ({
  creatorId,
  priceInXLMWithCost,
  code,
  issuer,
  signWith,
  storageSecret,
  userPublicKey,
  totoalTokenToSend,
}: {
  creatorId: string;
  priceInXLMWithCost: number;
  code: string;
  issuer: string;
  signWith: CustodialSigner;
  storageSecret: string;
  userPublicKey: string;
  totoalTokenToSend: number;
}) => {
  const server = horizonServer();

  const asset = new Asset(code, issuer);

  const motherAccount = Keypair.fromSecret(env.MOTHER_SECRET);

  const assetStorage = Keypair.fromSecret(storageSecret);

  const transactionInializer = await server.loadAccount(motherAccount.publicKey());

  const Tx1 = new TransactionBuilder(transactionInializer, {
    fee: TrxBaseFee,
    networkPassphrase,
  });

  Tx1.addOperation(
    Operation.payment({
      destination: userPublicKey,
      asset: asset,
      amount: totoalTokenToSend.toFixed(7),
      source: assetStorage.publicKey(),
    }),
  );
  Tx1.addOperation(
    Operation.payment({
      destination: motherAccount.publicKey(),
      asset: Asset.native(),
      amount: priceInXLMWithCost.toFixed(7),
      source: userPublicKey,
    }),
  );

  Tx1.setTimeout(0);
  const buildTrx = Tx1.build();

  buildTrx.sign(motherAccount, assetStorage);

  const xdr = buildTrx.toXDR();
  const singedXdr = signXdrForCustodialUser({ xdr, signWith });
  return singedXdr;
};

export const getCreatorShopAssetBalance = async ({
  creatorStoragePub,
}: {
  creatorStoragePub: string;
}) => {
  const server = horizonServer();
  const account = await server.loadAccount(creatorStoragePub);
  const balaces = account.balances;
  return balaces;
};
