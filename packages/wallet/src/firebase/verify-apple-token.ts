import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { AppError, ErrorCodes } from "@wadzzo/errors";

/**
 * The app id Apple issued identity tokens for. White-label apps with their own
 * bundle id set `APPLE_SIGN_IN_AUDIENCE`.
 */
const DEFAULT_APPLE_AUDIENCE = "com.thebillboardapp.wadzzo";

const appleKeys = jwksClient({ jwksUri: "https://appleid.apple.com/auth/keys" });

/** What Apple vouches for in an identity token. */
export interface AppleIdentity {
  /** Stable id of the Apple account (the same on every sign-in). */
  sub: string;
  /** The email Apple shares: the real one, or a private relay address. */
  email: string | undefined;
  emailVerified: boolean;
}

interface AppleTokenClaims {
  sub: string;
  email?: string;
  // Apple sends this as the string "true" or as a boolean
  email_verified?: boolean | string;
}

/** Verifies an Apple identity token against Apple's published keys. */
export async function verifyAppleToken(identityToken: string): Promise<AppleIdentity> {
  const decoded = jwt.decode(identityToken, { complete: true });
  const keyId = decoded?.header.kid;
  if (!keyId) {
    throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Invalid Apple sign-in token." });
  }

  const key = await appleKeys.getSigningKey(keyId);
  const claims = jwt.verify(identityToken, key.getPublicKey(), {
    algorithms: ["RS256"],
    audience: process.env.APPLE_SIGN_IN_AUDIENCE ?? DEFAULT_APPLE_AUDIENCE,
    issuer: "https://appleid.apple.com",
  }) as unknown as AppleTokenClaims;

  return {
    sub: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
  };
}
