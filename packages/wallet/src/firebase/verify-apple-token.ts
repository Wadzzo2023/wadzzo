import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { AppError, ErrorCodes } from "@wadzzo/errors";

/** The bundle id Apple issued the identity token for. */
const APPLE_AUDIENCE = "com.thebillboardapp.wadzzo";

const appleKeys = jwksClient({ jwksUri: "https://appleid.apple.com/auth/keys" });

export interface AppleIdentity {
  sub: string;
  name: string;
}

/** Verifies an Apple identity token against Apple's published keys. */
export async function verifyAppleToken(identityToken: string): Promise<AppleIdentity> {
  const decoded = jwt.decode(identityToken, { complete: true });
  const keyId = decoded?.header.kid;
  if (!keyId) {
    throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Invalid Apple sign-in token." });
  }

  const key = await appleKeys.getSigningKey(keyId);
  return jwt.verify(identityToken, key.getPublicKey(), {
    algorithms: ["RS256"],
    audience: APPLE_AUDIENCE,
  }) as unknown as AppleIdentity;
}
