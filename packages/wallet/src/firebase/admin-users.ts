import { getAuth } from "firebase-admin/auth";

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
 * The Firebase user behind a "Sign in with Apple" token: the existing user for
 * that email, or a new one linked to the Apple identity.
 */
export async function getOrCreateFirebaseUserFromApple(appleToken: string, email: string) {
  const appleIdentity = await verifyAppleToken(appleToken);
  const auth = adminAuth();

  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;

    const created = await auth.createUser({ email, displayName: appleIdentity.name });
    return auth.updateUser(created.uid, {
      providerToLink: { uid: appleIdentity.sub, providerId: "apple.com", email },
    });
  }
}

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
    if ((error as { code?: string }).code === "auth/user-not-found") return false;
    throw error;
  }
}
