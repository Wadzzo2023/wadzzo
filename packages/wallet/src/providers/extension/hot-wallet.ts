import { HOT } from "@hot-wallet/sdk";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { WalletType } from "../../wallet-type";
import { createExtensionProvider } from "../extension-provider";
import type { ExtensionWallet } from "../wallet-provider";

const isHotWalletInstalled = (): boolean =>
  typeof window !== "undefined" && Boolean((window as Window & { hotExtension?: unknown }).hotExtension);

const hotWallet: ExtensionWallet = {
  type: WalletType.hotWallet,
  label: "HOT Wallet",

  async connect() {
    if (!isHotWalletInstalled()) {
      throw new AppError(ErrorCodes.WALLET_PROVIDER_UNAVAILABLE, {
        message: "HOT Wallet extension is not installed.",
      });
    }
    try {
      const result = await HOT.request("stellar:getAddress", {});
      return (result).address;
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_CONNECTION_REJECTED, {
        message: "Failed to get address from HOT Wallet.",
        cause,
      });
    }
  },

  async signTransaction(xdr, publicKey) {
    try {
      const result = (await HOT.request("stellar:signTransaction", {
        xdr,
        accountToSign: publicKey,
      })) as { signedTxXdr: string };
      return result.signedTxXdr;
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
        message: `Signing failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      });
    }
  },
};

export const hotWalletProvider = createExtensionProvider(hotWallet);
