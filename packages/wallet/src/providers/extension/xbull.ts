import { xBullWalletConnect } from "@creit.tech/xbull-wallet-connect";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { stellarNetwork } from "../../config/stellar-network";
import { WalletType } from "../../wallet-type";
import { createExtensionProvider } from "../extension-provider";
import type { ExtensionWallet } from "../wallet-provider";

/** xBull talks to its extension through a short-lived bridge that must always be closed. */
async function withBridge<T>(use: (bridge: xBullWalletConnect) => Promise<T>): Promise<T> {
  const bridge = new xBullWalletConnect({ preferredTarget: "extension" });
  try {
    return await use(bridge);
  } finally {
    bridge.closeConnections();
  }
}

const xbullWallet: ExtensionWallet = {
  type: WalletType.xBull,
  label: "xBull",

  async connect() {
    try {
      return await withBridge((bridge) => bridge.connect());
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_PROVIDER_UNAVAILABLE, {
        message: "xBull extension is not installed or connection was rejected.",
        cause,
      });
    }
  },

  async signTransaction(xdr, publicKey) {
    try {
      // xBull wants the full network passphrase, not "PUBLIC"/"TESTNET".
      return await withBridge((bridge) =>
        bridge.sign({ xdr, publicKey, network: stellarNetwork.passphrase }),
      );
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
        message: `Signing failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      });
    }
  },
};

export const xbullProvider = createExtensionProvider(xbullWallet);
