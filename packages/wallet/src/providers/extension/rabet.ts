import { AppError, ErrorCodes } from "@wadzzo/errors";

import { stellarNetwork } from "../../config/stellar-network";
import { WalletType } from "../../wallet-type";
import { createExtensionProvider } from "../extension-provider";
import type { ExtensionWallet } from "../wallet-provider";

/** The slice of the `window.rabet` API we use. */
interface RabetApi {
  connect(): Promise<{ publicKey: string; error?: string }>;
  sign(xdr: string, network: "mainnet" | "testnet"): Promise<{ xdr: string; error?: string }>;
  disconnect(): Promise<void>;
}

const getRabet = (): RabetApi => {
  const rabet = (window as Window & { rabet?: RabetApi }).rabet;
  if (!rabet) {
    throw new AppError(ErrorCodes.WALLET_PROVIDER_UNAVAILABLE, {
      message: "Rabet extension is not installed. Install Rabet and try again.",
    });
  }
  return rabet;
};

const errorText = (error: unknown, fallback: string): string =>
  (typeof error === "object" && error !== null && "error" in error
    ? String(error.error)
    : undefined) ?? fallback;

const rabetWallet: ExtensionWallet = {
  type: WalletType.rabet,
  label: "Rabet",

  async connect() {
    const rabet = getRabet();
    try {
      return (await rabet.connect()).publicKey;
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_CONNECTION_REJECTED, {
        message: errorText(cause, "Rabet connection failed."),
        cause,
      });
    }
  },

  async signTransaction(xdr) {
    const rabet = getRabet();
    try {
      await rabet.connect();
      const result = await rabet.sign(xdr, stellarNetwork.rabetNetwork);
      if (!result.xdr) {
        throw new AppError(ErrorCodes.WALLET_SIGNING_FAILED, {
          message: "Signing failed. Please try again.",
        });
      }
      return result.xdr;
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
        message: errorText(cause, "Transaction signing cancelled or failed."),
        cause,
      });
    } finally {
      await rabet.disconnect();
    }
  },
};

export const rabetProvider = createExtensionProvider(rabetWallet);
