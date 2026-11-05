import { signIn } from "next-auth/react";

import { firebaseAuth } from "../firebase/client";
import { WalletType } from "../wallet-type";

import type {
  AlbedoCredential,
  AppleCredential,
  SignedChallengeCredential,
  SocialProviderCredential,
} from "./auth-credentials";

/** What next-auth's `signIn("credentials")` resolves with. */
export type CredentialSignInResult = Awaited<ReturnType<typeof signIn>>;

const signInWithCredentials = (credentials: Record<string, string | undefined>) =>
  signIn("credentials", { ...credentials, redirect: false });

/**
 * Signs in with an email and password. The server checks them with Firebase itself, so the browser's
 * own Firebase session (left behind by sign-up) is dropped first rather than kept alongside.
 */
export async function signInWithEmailPassword(email: string, password: string) {
  await firebaseAuth.signOut();
  return signInWithCredentials({ email, password, walletType: WalletType.emailPass });
}

export const signInWithAlbedo = ({ pubkey, signature, token, walletType }: AlbedoCredential) =>
  signInWithCredentials({ pubkey, signature, token, walletType });

export const signInWithSignedChallenge = ({
  pubkey,
  signedXDR,
  walletType,
}: SignedChallengeCredential) => signInWithCredentials({ pubkey, signedXDR, walletType });

export const signInWithSocialProvider = ({ email, token, walletType }: SocialProviderCredential) =>
  signInWithCredentials({ email, token, walletType });

export const signInWithApple = ({ email, token, appleToken, walletType }: AppleCredential) =>
  signInWithCredentials({ email, token, appleToken, walletType });
