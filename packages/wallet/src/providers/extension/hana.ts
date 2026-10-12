import { AppError, ErrorCodes } from "@wadzzo/errors";

import { stellarNetwork } from "../../config/stellar-network";
import { WalletType } from "../../wallet-type";
import { createExtensionProvider } from "../extension-provider";
import type { ExtensionWallet } from "../wallet-provider";

interface HanaStellarApi {
  getPublicKey(): Promise<string>;
  signTransaction(params: {
    xdr: string;
    accountToSign?: string;
    networkPassphrase?: string;
  }): Promise<string>;
}

const getHana = (): HanaStellarApi => {
  const hana = (window as Window & { hanaWallet?: { stellar?: HanaStellarApi } }).hanaWallet
    ?.stellar;
  if (!hana) {
    throw new AppError(ErrorCodes.WALLET_PROVIDER_UNAVAILABLE, {
      message: "Hana Wallet extension is not installed.",
    });
  }
  return hana;
};

const hanaWallet: ExtensionWallet = {
  type: WalletType.hana,
  label: "Hana",

  async connect() {
    const hana = getHana();
    try {
      return await hana.getPublicKey();
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_CONNECTION_REJECTED, {
        message: "Failed to get public key from Hana Wallet.",
        cause,
      });
    }
  },

  async signTransaction(xdr, publicKey) {
    const hana = getHana();
    try {
      return await hana.signTransaction({
        xdr,
        accountToSign: publicKey,
        networkPassphrase: stellarNetwork.passphrase,
      });
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
        message: `Signing failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      });
    }
  },
};

export const hanaProvider = createExtensionProvider(hanaWallet);
