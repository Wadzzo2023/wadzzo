import albedo, { type PublicKeyIntentResult } from "@albedo-link/intent";
import toast from "react-hot-toast";

import { stellarNetwork } from "../../config/stellar-network";
import { StellarTransactionError } from "../../errors/stellar-transaction-error";
import { signInWithAlbedo } from "../../session/sign-in-with-credentials";
import { abbreviateAddress, isInvalidPublicKey } from "@wadzzo/utils/utils";
import { WalletType } from "../../wallet-type";
import type { WalletProvider } from "../wallet-provider";

const LOGIN_RETRY_MESSAGE =
  "Login failed. Please try to login again after refreshing the page.";

/**
 * Albedo signs in by signing a one-time token, and signs *and submits*
 * transactions itself, so it doesn't fit the shared extension flow.
 */
export const albedoProvider: WalletProvider = {
  type: WalletType.albedo,
  label: "Albedo",

  async login() {
    const token = Math.random().toString(36).substring(2, 12);

    let intent: PublicKeyIntentResult;
    try {
      intent = await albedo.publicKey({ token });
    } catch (error) {
      console.error("[Albedo] publicKey failed", error);
      return void toast.error(LOGIN_RETRY_MESSAGE);
    }

    if (isInvalidPublicKey(intent.pubkey)) return void toast.error(LOGIN_RETRY_MESSAGE);

    const result = await toast.promise(
      signInWithAlbedo({
        pubkey: intent.pubkey,
        signature: intent.signature,
        token,
        walletType: WalletType.albedo,
      }),
      { error: "Login error", loading: "Please wait", success: null },
    );

    if (result?.ok) toast.success("Public Key : " + abbreviateAddress(intent.pubkey, 10));
    if (result?.error) toast.error(result.error);
  },

  async signAndSubmit(xdr, publicKey) {
    try {
      await albedo.tx({ xdr, pubkey: publicKey, network: stellarNetwork.albedoNetwork, submit: true });
      return true;
    } catch (error) {
      throw new StellarTransactionError(error);
    }
  },
};
