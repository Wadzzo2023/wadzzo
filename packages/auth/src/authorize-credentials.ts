import { verifyMessageSignature } from "@albedo-link/signature-verification";
import axios from "axios";
import { sendEmailVerification, signInWithEmailAndPassword } from "firebase/auth";

import { db } from "@wadzzo/db/server";
import { AppError, ErrorCodes } from "@wadzzo/errors";
import { getCurrentPlatform, getPlatformSlug, recordUserPlatform } from "@wadzzo/platform/server";
import { truncateString } from "@wadzzo/utils/string";
import { PLATFORM_ASSET, USER_ACCOUNT_URL } from "@wadzzo/wallet/config";
import { firebaseAuth } from "@wadzzo/wallet/firebase";
import {
  getOrCreateFirebaseUserFromApple,
  verifyFirebaseIdToken,
  verifyTransactionSignature,
} from "@wadzzo/wallet/server";
import {
  accountServiceResponseSchema,
  WalletType,
  type AuthCredential,
} from "@wadzzo/wallet/shared";

/** What a successful sign-in resolves to (the shape NextAuth keeps in the JWT). */
export interface AuthenticatedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  walletType: WalletType;
  emailVerified: boolean;
}

/** Wallets that sign a server-issued challenge transaction to prove ownership. */
const SIGNED_CHALLENGE_WALLETS: readonly WalletType[] = [
  WalletType.rabet,
  WalletType.freighter,
  WalletType.walletConnect,
  WalletType.metamask,
  WalletType.xBull,
  WalletType.hana,
  WalletType.hotWallet,
];

/**
 * The one implementation of "turn a credential into a user", shared by every
 * web app (NextAuth's CredentialsProvider) and the mobile API
 * (`POST /api/mobile/v1/auth/session`), so they can never disagree about who
 * someone is.
 *
 * Throws `WALLET_AUTH_FAILED` for a bad credential (Firebase error strings like
 * "Firebase: Error (auth/unverified-email)." are meant to reach the client).
 */
export async function authorizeCredentials(
  credential: AuthCredential,
): Promise<AuthenticatedUser | null> {
  switch (credential.walletType) {
    case WalletType.emailPass: {
      const { email, password, fromAppSign } = credential;
      const { user } = await signInWithEmailAndPassword(firebaseAuth, email, password);

      if (!user.emailVerified) {
        await sendEmailVerification(user);
        throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, {
          message: "Firebase: Error (auth/unverified-email).",
        });
      }
      const { publicKey } = await requestAccountPublicKey({ email, uid: user.uid, fromAppSign });
      const dbUser = await findOrCreateUser({
        publicKey,
        fromAppSign,
        email,
        signUpMethod: WalletType.emailPass,
      });
      return {
        ...dbUser,
        walletType: WalletType.emailPass,
        email,
        emailVerified: user.emailVerified,
      };
    }

    case WalletType.albedo: {
      const { pubkey, signature, token, fromAppSign } = credential;
      if (!verifyMessageSignature(pubkey, token, signature)) throw invalidSignature();
      const dbUser = await findOrCreateUser({
        publicKey: pubkey,
        fromAppSign,
        signUpMethod: credential.walletType,
      });
      return { ...dbUser, walletType: WalletType.albedo, emailVerified: true };
    }

    case WalletType.google:
    case WalletType.facebook: {
      const { token, email, fromAppSign } = credential;
      const { uid } = await verifyFirebaseIdToken(token);
      const { publicKey } = await requestAccountPublicKey({ uid, email, fromAppSign });
      const dbUser = await findOrCreateUser({
        publicKey,
        fromAppSign,
        email,
        signUpMethod: credential.walletType,
      });
      return { ...dbUser, walletType: credential.walletType, email, emailVerified: true };
    }

    case WalletType.apple: {
      const { appleToken, token, email, fromAppSign } = credential;
      let uid: string;
      if (token) {
        ({ uid } = await verifyFirebaseIdToken(token));
      } else if (appleToken) {
        ({ uid } = await getOrCreateFirebaseUserFromApple(appleToken, email));
      } else {
        return null;
      }
      const { publicKey } = await requestAccountPublicKey({ uid, email, fromAppSign });
      const dbUser = await findOrCreateUser({
        publicKey,
        fromAppSign,
        email,
        signUpMethod: credential.walletType,
      });
      return { ...dbUser, walletType: credential.walletType, email, emailVerified: true };
    }

    default: {
      if (SIGNED_CHALLENGE_WALLETS.includes(credential.walletType)) {
        const { pubkey, signedXDR, fromAppSign } = credential;
        if (!verifyTransactionSignature({ publicKey: pubkey, xdr: signedXDR })) {
          throw invalidSignature();
        }
        const dbUser = await findOrCreateUser({
          publicKey: pubkey,
          fromAppSign,
          signUpMethod: credential.walletType,
        });
        return { ...dbUser, walletType: credential.walletType, emailVerified: true };
      }
      return null;
    }
  }
}

const invalidSignature = () =>
  new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Invalid signature" });

/** The user row for a public key: created on first sign-in, topped up with email / sign-up method after. */
async function findOrCreateUser(input: {
  publicKey: string;
  fromAppSign?: string;
  email?: string;
  signUpMethod?: string;
}) {
  const { publicKey, fromAppSign, email, signUpMethod } = input;
  const platform = await getCurrentPlatform();
  const existing = await db.user.findUnique({ where: { id: publicKey } });

  if (existing) {
    await recordUserPlatform(platform, existing.id, { signUpMethod, isNewUser: false });
    if (!existing.email && email) {
      await db.user.update({ where: { id: publicKey }, data: { email } });
    }
    if (!existing.firstSignUpMethod && signUpMethod) {
      await db.user.update({ where: { id: publicKey }, data: { firstSignUpMethod: signUpMethod } });
    }
    return existing;
  }

  const created = await db.user.create({
    data: {
      id: publicKey,
      name: truncateString(publicKey),
      fromAppSignup: fromAppSign === "true",
      email,
      firstSignUpMethod: signUpMethod,
      signupPlatformId: platform.id,
    },
  });
  await recordUserPlatform(platform, created.id, { signUpMethod, isNewUser: true });
  return created;
}

/** Asks the accounts service for (and, first time, creates) the Stellar account of a Firebase user. */
async function requestAccountPublicKey(input: {
  uid: string;
  email: string;
  fromAppSign: string | undefined;
}) {
  const response = await axios.get<unknown>(USER_ACCOUNT_URL, {
    params: {
      uid: input.uid,
      email: input.email,
      from: PLATFORM_ASSET.code,
      // registered platforms are funded by their own account (stellar-accounts config/platforms)
      platform: getPlatformSlug(),
      fromAppSign: input.fromAppSign ? "true" : "false",
    },
  });
  return accountServiceResponseSchema.parse(response.data);
}
