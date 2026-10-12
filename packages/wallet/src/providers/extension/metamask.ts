import { AppError, ErrorCodes } from "@wadzzo/errors";

import { stellarExpertAccountUrl, stellarNetwork } from "../../config/stellar-network";
import { WalletType } from "../../wallet-type";
import { createExtensionProvider } from "../extension-provider";
import type { ExtensionWallet } from "../wallet-provider";

/** MetaMask signs for Stellar through this snap. */
const STELLAR_SNAP_ID = "npm:stellar-snap";

interface EthereumProvider {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

/** MetaMask can share `window.ethereum` with other wallets; pick MetaMask's own provider. */
function findMetaMaskProvider(): EthereumProvider {
  const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  const provider = ethereum?.providers?.find((candidate) => candidate.isMetaMask) ?? ethereum;
  if (!provider) {
    throw new AppError(ErrorCodes.WALLET_PROVIDER_UNAVAILABLE, {
      message: "MetaMask is not installed. Please install MetaMask and try again.",
    });
  }
  return provider;
}

const connectSnap = (provider: EthereumProvider) =>
  provider.request({ method: "wallet_requestSnaps", params: { [STELLAR_SNAP_ID]: {} } });

const invokeSnap = <T>(
  provider: EthereumProvider,
  method: string,
  params?: Record<string, unknown>,
) =>
  provider.request({
    method: "wallet_invokeSnap",
    params: { snapId: STELLAR_SNAP_ID, request: { method, params } },
  }) as Promise<T>;

const metamaskWallet: ExtensionWallet = {
  type: WalletType.metamask,
  label: "MetaMask",

  async connect() {
    const provider = findMetaMaskProvider();
    try {
      await connectSnap(provider);
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_CONNECTION_REJECTED, {
        message: "Failed to connect Stellar Snap. Please try again.",
        cause,
      });
    }
    try {
      return await invokeSnap<string>(provider, "getAddress");
    } catch (cause) {
      throw new AppError(ErrorCodes.WALLET_CONNECTION_REJECTED, {
        message: "Failed to get Stellar public key from MetaMask.",
        cause,
      });
    }
  },

  async signTransaction(xdr, publicKey) {
    const provider = findMetaMaskProvider();
    try {
      await connectSnap(provider);
      // The snap returns the signed XDR as a plain string or wrapped in an object.
      const result = await invokeSnap<string | { signedTransaction: string }>(
        provider,
        "signTransaction",
        { transaction: xdr, testnet: !stellarNetwork.isMainnet },
      );
      return typeof result === "string" ? result : result.signedTransaction;
    } catch (cause) {
      console.error(
        "[MetaMask] signing failed; the account may need funding:",
        stellarExpertAccountUrl(publicKey),
      );
      throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
        message: `Signing failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause,
      });
    }
  },
};

export const metamaskProvider = createExtensionProvider(metamaskWallet);
