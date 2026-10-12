import { signIn } from "next-auth/react";

import { hashPassword } from "@wadzzo/utils/hash";

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

/** Custodial accounts sign in with their own public key as both username and password. */
export async function signInWithPublicKey(publicKey: string, password: string) {
  return signInWithCredentials({ pubkey: publicKey, password: await hashPassword(password) });
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
