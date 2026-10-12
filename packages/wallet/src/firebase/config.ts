import { AppError, isEnvValidationSkipped } from "@wadzzo/errors";

/** Stands in for a missing value only while a build skips env validation (nothing is ever sent). */
const PLACEHOLDER = "env-validation-skipped";

function required(name: string, value: string | undefined): string {
  if (value) return value;
  if (isEnvValidationSkipped()) return PLACEHOLDER;
  throw new AppError("CONFIG_MISSING", {
    message: `Missing required environment variable ${name}.`,
    details: { name },
  });
}

/**
 * Firebase web config. Each `process.env.NEXT_PUBLIC_*` read is written out in
 * full so Next.js inlines it into the browser bundle.
 */
export const firebaseConfig = {
  apiKey: required(
    "NEXT_PUBLIC_AUTH_FIREBASE_API_KEY",
    process.env.NEXT_PUBLIC_AUTH_FIREBASE_API_KEY,
  ),
  authDomain: required("NEXT_PUBLIC_AUTH_DOMAIN", process.env.NEXT_PUBLIC_AUTH_DOMAIN),
  projectId: required("NEXT_PUBLIC_AUTH_PROJECT_ID", process.env.NEXT_PUBLIC_AUTH_PROJECT_ID),
  storageBucket: required(
    "NEXT_PUBLIC_AUTH_STORAGE_BUCKET",
    process.env.NEXT_PUBLIC_AUTH_STORAGE_BUCKET,
  ),
  messagingSenderId: required(
    "NEXT_PUBLIC_AUTH_MESSAGING_SENDER_ID",
    process.env.NEXT_PUBLIC_AUTH_MESSAGING_SENDER_ID,
  ),
  appId: required("NEXT_PUBLIC_AUTH_APP_ID", process.env.NEXT_PUBLIC_AUTH_APP_ID),
};
