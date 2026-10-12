import { requireEnv } from "@wadzzo/errors";

/**
 * Server settings the API code reads (secrets, third-party keys, URLs).
 *
 * Read when first *used*, never at import: an app that mounts only some of the
 * routers needs only those routers' settings, and a build with no environment
 * (`SKIP_ENV_VALIDATION`) can still compile every module. A missing required
 * setting throws `CONFIG_MISSING` naming the variable, at the call that needs it.
 *
 * The apps keep their own `env.js` for build-time validation and for
 * browser-visible settings.
 */
const REQUIRED = [
  /** The platform's own account: pays fees, signs for admins. */
  "MOTHER_SECRET",
  /** The account that holds creators' unminted assets. */
  "STORAGE_SECRET",
  "OPENAI_API_KEY",
  "PINATA_JWT",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_ENVIRONMENT",
  "NEXT_PUBLIC_HOME_DOMAIN",
  "NEXT_PUBLIC_URL",
  "NEXT_PUBLIC_NODEMAILER_USER",
  "NEXT_PUBLIC_NODEMAILER_PASS",
] as const;

const OPTIONAL = [
  /** AES key for creator issuer secrets (64 hex chars or base64). */
  "ISSUER_ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
  "MOBILE_JWT_SECRET",
  "EXPRESS_SERVER_URL",
  "GOOGLE_VISION_CREDENTIALS",
  "OPENAI_TEXT_MODEL",
  "OPENAI_IMAGE_MODEL",
  "SUPPORT_EMAIL",
  "BRAND_APP_ORIGINS",
  "NEXT_PUBLIC_MAPBOX_API",
  "NEXT_PUBLIC_WADZZO_AR_URL",
  "NEXT_PUBLIC_PLATFORM_CREATOR_TERM",
  "VERCEL",
] as const;

type RequiredKey = (typeof REQUIRED)[number];
type OptionalKey = (typeof OPTIONAL)[number];

export type ApiEnv = Readonly<
  Record<RequiredKey, string> &
    Record<OptionalKey, string | undefined> & {
      NODE_ENV: "development" | "test" | "production";
    }
>;

const requiredKeys: ReadonlySet<string> = new Set(REQUIRED);
const knownKeys: ReadonlySet<string> = new Set([...REQUIRED, ...OPTIONAL]);

export const env = new Proxy({} as ApiEnv, {
  get(_target, key) {
    if (typeof key !== "string") return undefined;
    if (key === "NODE_ENV") {
      const mode = process.env.NODE_ENV;
      return mode === "production" || mode === "test" ? mode : "development";
    }
    if (requiredKeys.has(key)) return requireEnv(key, process.env[key]);
    // Unknown names are a bug in the caller; fail loudly rather than return undefined.
    if (!knownKeys.has(key)) throw new Error(`env.${key} is not declared in @wadzzo/api/env`);
    return process.env[key] || undefined;
  },
}) as ApiEnv;
