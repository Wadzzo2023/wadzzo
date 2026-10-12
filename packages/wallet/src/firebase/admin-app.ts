import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";

import { requireEnv } from "@wadzzo/errors";

import { firebaseConfig } from "./config";

interface FirebaseAdminAppParams {
  projectId: string;
  clientEmail: string;
  storageBucket: string;
  privateKey: string;
}

/** Env files store the key with literal `\n`; turn them back into line breaks. */
const restoreLineBreaks = (key: string) => key.replace(/\\n/g, "\n");

export function createFirebaseAdminApp(params: FirebaseAdminAppParams) {
  if (getApps().length > 0) return getApp();

  return initializeApp({
    credential: cert({
      projectId: params.projectId,
      clientEmail: params.clientEmail,
      privateKey: restoreLineBreaks(params.privateKey),
    }),
    projectId: params.projectId,
    storageBucket: params.storageBucket,
  });
}

/** The Firebase Admin app, configured from this deployment's environment. */
export function initFirebaseAdmin() {
  return createFirebaseAdminApp({
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY", process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL", process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
  });
}
