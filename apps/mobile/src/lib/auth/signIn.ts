import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";

import { api } from "~/lib/api/client";
import type { SessionUser } from "~/lib/api/types";

import { firebaseAuth } from "./firebase";
import { useSession } from "./session";

/**
 * ── Sign-in flows ──────────────────────────────────────────────────────────
 *
 * Every method ends the same way: a credential → `POST /auth/session` on
 * wadzzoAR (which runs the same `authorizeCredentials` the web's NextAuth
 * does, creating the wallet and User row on first sign-in) → token stored.
 * See docs/03-auth.md.
 */

type SessionResponse = { token: string; user: SessionUser };

const ACCOUNT_XDR_URL = "https://accounts.action-tokens.com/api/account_xdr";
const PENDING_NAME_KEY = (email: string) => `wadzzo.pendingName.${email}`;
const APPLE_EMAIL_KEY = "wadzzo.apple.email";

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

/**
 * Same as the old app (decided): after email/Google/Apple sign-in, call the
 * accounts service's `account_xdr` and ignore the answer. Fire-and-forget and
 * silent — it must never slow down or fail a sign-in.
 */
function pingAccountXdr(email: string | null | undefined) {
  if (!email) return;
  fetch(`${ACCOUNT_XDR_URL}?email=${encodeURIComponent(email)}`).catch(() => undefined);
}

async function createSession(body: Record<string, unknown>) {
  const res = await api<SessionResponse>("/auth/session", { method: "POST", body });
  await useSession.getState().setSession(res.token, res.user);
  return res.user;
}

/** A display name chosen at registration, applied on the first sign-in. */
async function applyPendingName(email: string) {
  const key = PENDING_NAME_KEY(email);
  const name = await AsyncStorage.getItem(key);
  if (!name) return;
  await AsyncStorage.removeItem(key);
  try {
    await api("/me/profile", { method: "PATCH", body: { name } });
    useSession.getState().patchUser({ name });
  } catch {
    // Name taken or too short — the onboarding sheet lets them pick again.
  }
}

// ── Email + password ──────────────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string) {
  const e = email.trim().toLowerCase();
  // The server checks the password with Firebase, requires a verified email
  // (re-sending the link when it isn't), and creates wallet + user if new.
  const user = await createSession({ walletType: "emailPass", email: e, password });
  pingAccountXdr(e);
  await applyPendingName(e);
  return user;
}

export async function registerWithEmail(name: string, email: string, password: string) {
  const e = email.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(firebaseAuth, e, password);
  await sendEmailVerification(cred.user);
  if (name.trim()) await AsyncStorage.setItem(PENDING_NAME_KEY(e), name.trim());
  await firebaseSignOut(firebaseAuth);
}

/** Needs the password: Firebase only sends verification to a signed-in user. */
export async function resendVerification(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password);
  await sendEmailVerification(cred.user);
  await firebaseSignOut(firebaseAuth);
}

export async function sendPasswordReset(email: string) {
  try {
    await sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase());
  } catch (e) {
    // Don't reveal whether an account exists: "no such user" reads the same
    // as success. Everything else (bad email, network) is a real failure.
    if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
  }
}

// ── Google ────────────────────────────────────────────────────────────────

/** Resolves `null` when the user closes the Google sheet. */
export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  let res;
  try {
    res = await GoogleSignin.signIn();
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return null;
    throw e;
  }
  if (!isSuccessResponse(res) || !res.data.idToken) return null;

  const credential = GoogleAuthProvider.credential(res.data.idToken);
  const fb = await signInWithCredential(firebaseAuth, credential);
  const token = await fb.user.getIdToken();
  const email = fb.user.email ?? res.data.user.email;
  await firebaseSignOut(firebaseAuth);

  const user = await createSession({ walletType: "google", email, token });
  pingAccountXdr(email);
  return user;
}

// ── Apple ─────────────────────────────────────────────────────────────────

function emailFromIdentityToken(token: string): string | null {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = JSON.parse(
      globalThis.atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

/** Resolves `null` when the user cancels. iOS only. */
export async function signInWithApple() {
  let cred;
  try {
    cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
  if (!cred.identityToken) throw new Error("Apple didn't return a sign-in token");

  // Apple sends the email only on the very first authorisation; keep it.
  let email = cred.email ?? emailFromIdentityToken(cred.identityToken);
  if (email) await SecureStore.setItemAsync(APPLE_EMAIL_KEY, email);
  else email = await SecureStore.getItemAsync(APPLE_EMAIL_KEY);
  if (!email) {
    throw new Error(
      "Apple didn't share an email. In Settings → Apple ID → Sign in with Apple, remove Wadzzo, then try again.",
    );
  }

  const user = await createSession({ walletType: "apple", email, appleToken: cred.identityToken });
  pingAccountXdr(email);
  return user;
}

// ── Albedo ────────────────────────────────────────────────────────────────

/** The bridge page returns `{ pubkey, signature }` for the token we sent. */
export async function signInWithAlbedo(res: { pubkey: string; signature: string }, token: string) {
  return createSession({ walletType: "albedo", pubkey: res.pubkey, signature: res.signature, token });
}

export function randomToken() {
  const bytes = Crypto.getRandomBytes(12);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Sign out ──────────────────────────────────────────────────────────────

export async function signOutProviders() {
  await firebaseSignOut(firebaseAuth).catch(() => undefined);
  await GoogleSignin.signOut().catch(() => undefined);
}
