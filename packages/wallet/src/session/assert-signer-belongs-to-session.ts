import { AppError, ErrorCodes } from "@wadzzo/errors";

import { isCustodialWallet } from "../wallet-type";

/** The signed-in user, as far as signing is concerned. */
export interface SigningSessionUser {
  email?: string | null;
  walletType?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const refuse = (message: string) =>
  new AppError(ErrorCodes.AUTH_FORBIDDEN, { message, details: { reason: "signer-mismatch" } });

/**
 * `signWith` arrives from the browser, and `signXdrForCustodialUser` signs with
 * whatever key it names: a custodial account's secret, or the platform's own.
 * So before any procedure runs, the requested signer has to be the caller:
 *
 * - `{ email }`   → the caller's own custodial account (same email, custodial wallet type)
 * - `{ isAdmin }` → only when the caller really is an admin of this platform
 *
 * `requested` is the raw `signWith` value from the request (it has not been
 * through zod yet, so every shape is accepted and judged here).
 */
export async function assertSignerBelongsToSession({
  requested,
  user,
  isPlatformAdmin,
}: {
  requested: unknown;
  user: SigningSessionUser;
  /** Looked up lazily: only asked when an admin signer was requested. */
  isPlatformAdmin: () => Promise<boolean>;
}): Promise<void> {
  if (requested === undefined || requested === null) return;
  if (!isRecord(requested)) throw refuse("That signer isn't allowed.");

  if (requested.isAdmin) {
    if (!(await isPlatformAdmin())) throw refuse("Only admins can sign as the platform.");
  }

  if ("email" in requested && requested.email !== undefined) {
    const { email } = requested;
    if (
      typeof email !== "string" ||
      !user.email ||
      !isCustodialWallet(user.walletType ?? undefined) ||
      !sameEmail(email, user.email)
    ) {
      throw refuse("You can only sign for your own account.");
    }
  }
}
