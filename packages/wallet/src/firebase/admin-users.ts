import { getAuth } from "firebase-admin/auth";

import { AppError, ErrorCodes } from "@wadzzo/errors";

import { initFirebaseAdmin } from "./admin-app";
import { verifyAppleToken } from "./verify-apple-token";

/** Firebase Admin's auth service for this deployment's project. */
const adminAuth = () => getAuth(initFirebaseAdmin());

/** Verifies a Firebase ID token and returns who it belongs to. */
export async function verifyFirebaseIdToken(idToken: string) {
  return adminAuth().verifyIdToken(idToken);
}

/** The Firebase user for an email, or `undefined` when there is none (or Firebase errors). */
export async function findFirebaseUserByEmail(email: string) {
  try {
    return await adminAuth().getUserByEmail(email);
  } catch (error) {
    console.error("[firebase] getUserByEmail failed", error);
    return undefined;
  }
}

/** The email on a Firebase user, falling back to the first linked provider's. */
export async function findEmailByFirebaseUid(uid: string): Promise<string | undefined> {
  try {
    const user = await adminAuth().getUser(uid);
    return user.email ?? user.providerData[0]?.email ?? undefined;
  } catch (error) {
    console.error("[firebase] getUser failed", error);
    return undefined;
  }
}

/**
 * The Firebase user behind a "Sign in with Apple" identity token.
 *
 * Which account you get is decided only by what Apple vouches for in the
 * token, never by an email the client sends alongside it (otherwise anyone
 * with *an* Apple token could ask for someone else's account):
 *
 * 1. an Apple account that signed in before → the Firebase user linked to it;
 * 2. first time → the user for the email Apple verified (linked to this Apple
 *    account from now on), created if there is none.
 */
export async function getOrCreateFirebaseUserFromApple(appleToken: string) {
  const identity = await verifyAppleToken(appleToken);
  const auth = adminAuth();

  try {
    return await auth.getUserByProviderUid("apple.com", identity.sub);
  } catch (error) {
    if (!isUserNotFound(error)) throw error;
  }

  if (!identity.email || !identity.emailVerified) {
    throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, {
      message: "Apple didn't share a verified email address. Use another sign-in method.",
    });
  }

  const providerToLink = { uid: identity.sub, providerId: "apple.com", email: identity.email };
  try {
    const existing = await auth.getUserByEmail(identity.email);
    return await auth.updateUser(existing.uid, { providerToLink });
  } catch (error) {
    if (!isUserNotFound(error)) throw error;
  }

  const created = await auth.createUser({ email: identity.email, emailVerified: true });
  return auth.updateUser(created.uid, { providerToLink });
}

const isUserNotFound = (error: unknown) =>
  (error as { code?: string }).code === "auth/user-not-found";

/**
 * Deletes the Firebase account for `email`.
 * Resolves `false` when there is none (wallet sign-ups have no Firebase user).
 */
export async function deleteFirebaseUserByEmail(email: string): Promise<boolean> {
  const auth = adminAuth();
  try {
    const user = await auth.getUserByEmail(email);
    await auth.deleteUser(user.uid);
    return true;
  } catch (error) {
    if (isUserNotFound(error)) return false;
    throw error;
  }
}
