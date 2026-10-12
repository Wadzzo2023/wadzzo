import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, initializeAuth, type Auth } from "firebase/auth";

/**
 * Firebase is used client-side only for what the old app and wadzz0 do in the
 * browser: create an email/password account, send the verification and reset
 * emails, and turn a Google credential into a Firebase ID token. The session
 * itself is wadzzoAR's token (session.ts), so Firebase keeps nothing between
 * launches — in-memory persistence on purpose.
 *
 * Project `auth-29d94`, shared with wadzzoAR and wadzz0.
 */
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(config);

let authInstance: Auth;
try {
  authInstance = initializeAuth(app, { persistence: inMemoryPersistence });
} catch {
  // Fast refresh re-runs this module; auth is already initialised.
  authInstance = getAuth(app);
}

export const firebaseAuth = authInstance;
