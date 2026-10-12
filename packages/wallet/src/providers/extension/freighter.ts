import { isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { stellarNetwork } from "../../config/stellar-network";
import { WalletType } from "../../wallet-type";
import { createExtensionProvider } from "../extension-provider";
import type { ExtensionWallet } from "../wallet-provider";

/** Freighter's API reports failures as `{ error }` instead of throwing. */
const messageOf = (error: { message?: string } | string | undefined): string | undefined =>
  typeof error === "string" ? error : error?.message;

const freighterWallet: ExtensionWallet = {
  type: WalletType.freighter,
  label: "Freighter",

  async connect() {
    const status = await isConnected();
    if (!status.isConnected) {
      throw new AppError(ErrorCodes.WALLET_PROVIDER_UNAVAILABLE, {
        message: "Freighter extension is not installed. Install Freighter and try again",
      });
    }

    const access = await requestAccess();
    if (access.error || !access.address) {
      throw new AppError(ErrorCodes.WALLET_CONNECTION_REJECTED, {
        message: "Login failed. Please try to login again after refreshing the page.",
        cause: access.error,
      });
    }
    return access.address;
  },

  async signTransaction(xdr, publicKey) {
    const signed = await signTransaction(xdr, {
      networkPassphrase: stellarNetwork.passphrase,
      address: publicKey,
    });
    if (signed.error || !signed.signedTxXdr) {
      throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
        message: messageOf(signed.error) ?? undefined,
        cause: signed.error,
      });
    }
    return signed.signedTxXdr;
  },
};

export const freighterProvider = createExtensionProvider(freighterWallet);
