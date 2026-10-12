import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type UserCredential,
} from "firebase/auth";
import toast from "react-hot-toast";

import { firebaseAuth } from "../../firebase/client";
import { signInWithApple, signInWithSocialProvider } from "../../session/sign-in-with-credentials";
import { WalletType } from "../../wallet-type";
import type { WalletProvider } from "../wallet-provider";
import { requestCustodialAccount } from "./account-service";
import { submitCustodialTransaction } from "./submit-custodial-transaction";

const LOGIN_PENDING = { error: "Login error", loading: "Please Wait", success: null } as const;

/** Creates the app session for a Firebase social user, then makes sure their Stellar account exists. */
async function startSessionAndProvisionAccount(
  credential: UserCredential,
  email: string,
  signIn: (idToken: string) => Promise<{ ok?: boolean; error?: string | null } | undefined>,
  options: { provisionAccount: boolean },
): Promise<void> {
  const { user } = credential;
  const result = await toast.promise(
    user.getIdToken().then(signIn),
    LOGIN_PENDING,
  );

  if (result?.error) toast.error(result.error);
  if (!result?.ok) return;
  toast.success("Login Successfully");

  if (options.provisionAccount) {
    await toast.promise(requestCustodialAccount({ uid: user.uid, email }), {
      loading: "Getting public key...",
      success: "Received public key",
      error: "Unable to get public key",
    });
  }
}

export const googleProvider: WalletProvider = {
  type: WalletType.google,
  label: "Google",

  async login() {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/userinfo.email");

    try {
      const credential = await signInWithPopup(firebaseAuth, provider);
      const email = credential.user.providerData[0]?.email;
      if (!email) return void toast.error("Email dont exist");

      await startSessionAndProvisionAccount(
        credential,
        email,
        (token) => signInWithSocialProvider({ email, token, walletType: WalletType.google }),
        { provisionAccount: true },
      );
    } catch (error) {
      console.error("[Google sign-in] failed", error);
    }
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};

export const appleProvider: WalletProvider = {
  type: WalletType.apple,
  label: "Apple",

  async login() {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");

    try {
      const credential = await signInWithPopup(firebaseAuth, provider);
      const email = credential.user.email;
      if (!email) {
        return void toast.error("Please share you email with us. without we can't proceed");
      }

      await startSessionAndProvisionAccount(
        credential,
        email,
        (token) => signInWithApple({ email, token, walletType: WalletType.apple }),
        { provisionAccount: true },
      );
    } catch (error) {
      console.error("[Apple sign-in] failed", error);
    }
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};

export const facebookProvider: WalletProvider = {
  type: WalletType.facebook,
  label: "Facebook",

  async login() {
    const provider = new FacebookAuthProvider();
    provider.addScope("email");
    provider.setCustomParameters({ display: "popup" });

    try {
      const credential = await signInWithPopup(firebaseAuth, provider);
      const email = credential.user.providerData[0]?.email;
      if (!email) return void toast.error("Email dont exist");

      const idToken = await credential.user.getIdToken();
      await signInWithSocialProvider({ email, token: idToken, walletType: WalletType.facebook });
    } catch (error) {
      console.error("[Facebook sign-in] failed", error);
    }
  },

  signAndSubmit: (xdr) => submitCustodialTransaction(xdr),
};
