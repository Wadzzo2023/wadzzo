/* eslint-disable */
import { verifyMessageSignature } from "@albedo-link/signature-verification";
import axios from "axios";
import {
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { WalletType } from "@wadzzo/wallet/shared";
import { getOrCreateFirebaseUserFromApple, verifyFirebaseIdToken } from "@wadzzo/wallet/server";
import { firebaseAuth } from "@wadzzo/wallet/firebase";
import { USER_ACCOUNT_URL } from "@wadzzo/wallet/config";
import { verifyTransactionSignature } from "@wadzzo/wallet/server";
import { accountServiceResponseSchema } from "@wadzzo/wallet/shared";
import { z } from "zod";

import { env } from "~/env";
import { db } from "@wadzzo/db/server";
import { getCurrentPlatform, recordUserPlatform } from "@wadzzo/platform/server";
import type { AuthCredential } from "@wadzzo/wallet/shared";
import { truncateString } from "@wadzzo/utils/string";
import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * ── Credential sign-in ─────────────────────────────────────────────────────
 *
 * The one implementation of "turn a credential into a user", shared by the
 * web (NextAuth's CredentialsProvider in `server/auth.ts`) and the mobile app
 * (`POST /api/mobile/v1/auth/session`). Moved here verbatim from NextAuth's
 * `authorize()` so the two can never disagree about who someone is.
 *
 * Throws on a bad credential (Firebase error strings like
 * "Firebase: Error (auth/unverified-email)." are meant to reach the client).
 */
export type AuthUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  walletType: WalletType;
  emailVerified: boolean;
};

export async function authorizeCredentials(
  cred: AuthCredential,
): Promise<AuthUser | null> {

    // email pass login
    if (cred.walletType == WalletType.emailPass) {
      const { email, password, fromAppSign } = cred;
      const userCredential = await signInWithEmailAndPassword(
        firebaseAuth,
        email,
        password,
      );
      const user = userCredential.user;

      if (!user.emailVerified) {
        await sendEmailVerification(user);
        const errorCode = "auth/unverified-email";
        throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: `Firebase: Error (${errorCode}).` });
      }
      const data = await getUserPublicKey({ email: email, uid: user.uid, fromAppSign });
      const sessionUser = await dbUser(
        data.publicKey,
        fromAppSign,
        email,
        WalletType.emailPass,
      );
      return {
        ...sessionUser,
        walletType: WalletType.emailPass,
        email: email,
        emailVerified: user.emailVerified,
      };
    }

    // wallet login
    if (cred.walletType == WalletType.albedo) {
      const { pubkey, signature, token, fromAppSign } = cred;

      const isValid = verifyMessageSignature(pubkey, token, signature);
      if (isValid) {
        const sessionUser = await dbUser(
          pubkey,
          fromAppSign,
          undefined,
          cred.walletType,
        );
        return {
          ...sessionUser,
          walletType: WalletType.albedo,
          emailVerified: true,
        };
      }
      throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Invalid signature" });
    }
    // wallet rabet and frieghter
    if (
      cred.walletType == WalletType.rabet ||
      cred.walletType == WalletType.freighter ||
      cred.walletType == WalletType.walletConnect ||
      cred.walletType == WalletType.metamask ||
      cred.walletType == WalletType.xBull ||
      cred.walletType == WalletType.hana ||
      cred.walletType == WalletType.hotWallet
    ) {
      const { pubkey, signedXDR, fromAppSign } = cred;
      const isValid = await verifyTransactionSignature({
        publicKey: pubkey,
        xdr: signedXDR,
      });
      if (isValid) {
        const sessionUser = await dbUser(
          pubkey,
          fromAppSign,
          undefined,
          cred.walletType,
        );
        return {
          ...sessionUser,
          walletType: cred.walletType,
          emailVerified: true,
        };
      }
      throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Invalid signature" });
    }

    // provider logins
    if (
      cred.walletType == WalletType.google ||
      cred.walletType == WalletType.facebook
    ) {
      const { token, email, fromAppSign } = cred;

      const { uid } = await verifyFirebaseIdToken(token);
      const data = await getUserPublicKey({ uid, email, fromAppSign });
      const sessionUser = await dbUser(
        data.publicKey,
        fromAppSign,
        email,
        cred.walletType,
      );
      return {
        ...sessionUser,
        walletType: cred.walletType,
        email: email,
        emailVerified: true,
      };
    }

    if (cred.walletType == WalletType.apple) {
      const { appleToken, token, email, fromAppSign } = cred;

      if (token) {
        const { uid } = await verifyFirebaseIdToken(token);
        const data = await getUserPublicKey({ uid, email, fromAppSign });
        const sessionUser = await dbUser(
          data.publicKey,
          fromAppSign,
          email,
          cred.walletType,
        );
        return {
          ...sessionUser,
          walletType: cred.walletType,
          emailVerified: true,
          email: email,
        };
      } else {
        if (appleToken) {
          const { uid } = await getOrCreateFirebaseUserFromApple(appleToken, email);

          const data = await getUserPublicKey({ uid, email, fromAppSign });
          const sessionUser = await dbUser(
            data.publicKey,
            fromAppSign,
            email,
            cred.walletType,
          );
          return {
            ...sessionUser,
            walletType: cred.walletType,
            emailVerified: true,
            email: email,
          };
        }
      }
    }

    return null;
}

async function dbUser(
  pubkey: string,
  fromAppSign?: string,
  email?: string,
  signUpMethod?: string,
) {
  const platform = await getCurrentPlatform();
  const user = await db.user.findUnique({ where: { id: pubkey } });
  // if user exists, check if email is set, if not set it
  if (user) {
    await recordUserPlatform(platform, user.id, { signUpMethod, isNewUser: false });
    const profileEmail = user.email;
    if (!profileEmail && email) {
      await db.user.update({
        where: { id: pubkey },
        data: { email: email },
      });
    }
    const firstSignUpMethod = user.firstSignUpMethod;
    if (!firstSignUpMethod && signUpMethod) {
      await db.user.update({
        where: { id: pubkey },
        data: {
          firstSignUpMethod: signUpMethod,
        },
      });
    }

    return user;
  } else {
    const data = await db.user.create({
      data: {
        id: pubkey,
        name: truncateString(pubkey),
        fromAppSignup: fromAppSign === "true" ? true : false,
        email: email,
        firstSignUpMethod: signUpMethod,
        signupPlatformId: platform.id,
      },
    });
    await recordUserPlatform(platform, data.id, { signUpMethod, isNewUser: true });
    return data;
  }
}

async function getUserPublicKey({
  uid,
  email,
  fromAppSign
}: {
  uid: string;
  email: string;
  fromAppSign: string | undefined;
}) {
  const res = await axios.get<z.infer<typeof accountServiceResponseSchema>>(
    USER_ACCOUNT_URL,
    {
      params: {
        uid,
        email,
        from: env.NEXT_PUBLIC_ASSET_CODE ?? "ACTION",
        // registered platforms are funded by their own account (stellar-accounts config/platforms)
        platform: env.PLATFORM_SLUG,
        fromAppSign: fromAppSign ? "true" : "false",
      },
    },
  );
  return res.data;
}
