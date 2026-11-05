import toast from "react-hot-toast";
import { showAuthError } from "../ui/auth-notice";

import { isAppError } from "@wadzzo/errors";

import { submitSignedTransaction } from "../stellar/horizon";
import { signInWithSignedChallenge } from "../session/sign-in-with-credentials";
import { showFundAccountToast } from "../ui/fund-account-toast";
import { abbreviateAddress, isInvalidPublicKey } from "@wadzzo/utils/address";
import type { SignedChallengeCredential } from "../session/auth-credentials";
import type { ExtensionWallet, WalletProvider } from "./wallet-provider";

const LOGIN_RETRY_MESSAGE = "Login failed. Please try again after refreshing the page.";

/** The server-issued transaction a wallet signs to prove it owns an account. */
async function fetchLoginChallenge(publicKey: string): Promise<string | null> {
  const response = await toast.promise(fetch(`/api/xdr?pubkey=${publicKey}`), {
    error: "Error fetching XDR",
    loading: "Fetching XDR",
    success: "XDR fetched",
  });
  if (!response.ok) return null;
  return ((await response.json()) as { xdr: string }).xdr;
}

const toastError = (error: unknown, fallback: string): void => {
  showAuthError(isAppError(error) ? error.message : fallback);
};

/** The sign-in flow every extension wallet shares: connect → challenge → sign → session. */
export function createExtensionProvider(wallet: ExtensionWallet): WalletProvider {
  return {
    type: wallet.type,
    label: wallet.label,

    async login() {
      let publicKey: string;
      try {
        publicKey = await wallet.connect();
      } catch (error) {
        console.error(`[${wallet.label}] connect failed`, error);
        return toastError(error, LOGIN_RETRY_MESSAGE);
      }

      if (isInvalidPublicKey(publicKey)) {
        return void showAuthError(LOGIN_RETRY_MESSAGE);
      }

      const challenge = await fetchLoginChallenge(publicKey);
      if (!challenge) return showFundAccountToast(publicKey);

      let signedXdr: string;
      try {
        signedXdr = await wallet.signTransaction(challenge, publicKey);
      } catch (error) {
        console.error(`[${wallet.label}] signing failed`, error);
        return toastError(error, "Signing failed.");
      }

      const credential = {
        pubkey: publicKey,
        signedXDR: signedXdr,
        walletType: wallet.type,
      } as SignedChallengeCredential;
      const result = await signInWithSignedChallenge(credential);

      if (result?.ok) {
        toast.success("Login successful");
        toast.success("Public Key: " + abbreviateAddress(publicKey, 10));
      }
      if (result?.error) showAuthError(result.error);
    },

    async signAndSubmit(xdr, publicKey) {
      let signedXdr: string;
      try {
        signedXdr = await wallet.signTransaction(xdr, publicKey);
      } catch (error) {
        console.error(`[${wallet.label}] signing failed`, error);
        return false;
      }
      if (!signedXdr) return false;
      await submitSignedTransaction(signedXdr);
      return true;
    },
  };
}
