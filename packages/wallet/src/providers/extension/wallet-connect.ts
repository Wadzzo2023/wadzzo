/* eslint-disable @typescript-eslint/no-explicit-any -- WalletConnect's session types are not exported */
import SignClient from "@walletconnect/sign-client";
import { getSdkError } from "@walletconnect/utils";
import { ConfigCtrl, ModalCtrl } from "@web3modal/core";
import { Web3Modal } from "@web3modal/standalone";
import toast from "react-hot-toast";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { stellarNetwork } from "../../config/stellar-network";
import { signInWithSignedChallenge } from "../../session/sign-in-with-credentials";
import { abbreviateAddress, isInvalidPublicKey } from "@wadzzo/utils/utils";
import { WalletType } from "../../wallet-type";
import type { WalletProvider } from "../wallet-provider";

type StellarMethod = "stellar_signXDR" | "stellar_signAndSubmitXDR";

const STELLAR_METHODS: Record<"SIGN" | "SIGN_AND_SUBMIT", StellarMethod> = {
  SIGN: "stellar_signXDR",
  SIGN_AND_SUBMIT: "stellar_signAndSubmitXDR",
};

/** Used when NEXT_PUBLIC_WALLET_CONNECT_ID isn't set. */
const DEFAULT_WALLET_CONNECT_PROJECT_ID = "f1aeccdd62aff60ec7f578ec3661321f";
const SESSION_TIMEOUT_MS = 180_000;
const ALL_STELLAR_CHAINS = ["stellar:pubnet", "stellar:testnet"];

const projectId = () => process.env.NEXT_PUBLIC_WALLET_CONNECT_ID ?? DEFAULT_WALLET_CONNECT_PROJECT_ID;

const requiredNamespaces = {
  stellar: { methods: Object.values(STELLAR_METHODS), chains: ALL_STELLAR_CHAINS, events: [] },
};

let signClient: SignClient | undefined;

/** Creates the WalletConnect client; call once before opening the connect dialog. */
export async function configureWalletConnectClient(): Promise<void> {
  signClient = await SignClient.init({
    projectId: projectId(),
    metadata: {
      name: process.env.NEXT_PUBLIC_TITLE ?? "Wallet",
      description: process.env.NEXT_PUBLIC_DESC ?? "To connect your wallet",
      url: process.env.NEXT_PUBLIC_URL ?? "https://wallet.stellar.org",
      icons: [process.env.NEXT_PUBLIC_ICON ?? "https://wallet.stellar.org/favicon.ico"],
    },
  });
}

export async function disconnectWalletConnect(topic: string): Promise<void> {
  await signClient?.disconnect({ topic, reason: getSdkError("USER_DISCONNECTED") });
}

ConfigCtrl.setConfig({
  projectId: projectId(),
  enableStandaloneMode: true,
  enableNetworkView: true,
  themeMode: "light" as const,
  themeColor: "default" as const,
  desktopWallets: [],
});

const rejectAfter = (ms: number, message: string) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms));

/** The public key is the third part of a CAIP-10 account id (`stellar:pubnet:G…`). */
const publicKeyOfSession = (session: any): string =>
  String(session.namespaces.stellar.accounts[0]).split(":")[2] ?? "";

async function login(): Promise<void> {
  if (!signClient) return;
  const client = signClient;

  const { uri, approval } = await client.connect({ requiredNamespaces });
  if (!uri) return;

  ModalCtrl.open({ uri, standaloneChains: ALL_STELLAR_CHAINS });

  try {
    toast("WalletConnect session timeout 3 minute");
    const session: any = await Promise.race([
      rejectAfter(SESSION_TIMEOUT_MS, "timeout wc"),
      approval(),
    ]);

    const publicKey = publicKeyOfSession(session);
    if (isInvalidPublicKey(publicKey)) {
      return void toast.error(
        "Login failed. Please try to login again after refreshing the page.",
      );
    }

    const toastId = toast.loading("Please wait");
    try {
      const challengeResponse = await fetch(`/api/xdr?pubkey=${publicKey}`);
      if (!challengeResponse.ok) return;
      const { xdr } = (await challengeResponse.json()) as { xdr: string };

      const signed: any = await client.request({
        topic: session.topic,
        chainId: stellarNetwork.walletConnectChain,
        request: { method: STELLAR_METHODS.SIGN, params: { xdr } },
      });
      ModalCtrl.close();

      if (!signed.signedXDR) {
        return void toast.error(
          "Internal error, please try again later or contact an admin for help",
        );
      }

      const result = await signInWithSignedChallenge({
        pubkey: publicKey,
        signedXDR: signed.signedXDR,
        walletType: WalletType.walletConnect,
      });
      if (result?.ok) {
        toast.success("Login successful");
        toast.success("Public Key : " + abbreviateAddress(publicKey, 10));
      }
      if (result?.error) toast.error(result.error);
    } catch (error) {
      console.error("[WalletConnect] login failed", error);
    } finally {
      toast.dismiss(toastId);
    }
  } catch {
    toast.error("Reject");
  } finally {
    ModalCtrl.close();
    toast("WalletConnect session ended");
  }
}

/**
 * Opens the WalletConnect modal, lets the user approve a session and runs
 * `method` for `xdr`. Resolves the signed XDR (sign) or `true` (sign + submit).
 */
async function requestSignature(xdr: string, method: StellarMethod): Promise<string | boolean | undefined> {
  const modal = new Web3Modal({
    walletConnectVersion: 2,
    projectId: projectId(),
    standaloneChains: ALL_STELLAR_CHAINS,
  });

  await configureWalletConnectClient();
  if (!signClient) return undefined;

  try {
    const { uri, approval } = await signClient.connect({ requiredNamespaces });
    if (!uri) return undefined;

    await modal.openModal({ uri });
    const session = await approval();
    const result: any = await signClient.request({
      topic: session.topic,
      chainId: stellarNetwork.walletConnectChain,
      request: { method, params: { xdr } },
    });
    modal.closeModal();

    if (method === STELLAR_METHODS.SIGN_AND_SUBMIT) {
      return result.result?.status === "success" ? true : undefined;
    }
    return result.signedXDR as string | undefined;
  } catch (cause) {
    console.error("[WalletConnect] request failed", cause);
    throw new AppError(ErrorCodes.WALLET_SIGNING_REJECTED, {
      message: `Transaction declined. ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    });
  } finally {
    modal.closeModal();
  }
}

export const walletConnectProvider: WalletProvider = {
  type: WalletType.walletConnect,
  label: "WalletConnect",
  login,

  async signAndSubmit(xdr) {
    // The wallet submits the transaction itself.
    const result = await requestSignature(xdr, STELLAR_METHODS.SIGN_AND_SUBMIT);
    return Boolean(result);
  },
};
