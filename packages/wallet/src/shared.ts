/**
 * Wallet types and schemas that are safe on the server *and* in the browser:
 * no React, no browser APIs, no secrets.
 */
export {
  WalletType,
  CUSTODIAL_WALLET_TYPES,
  isCustodialWallet,
  isServerSignedWallet,
} from "./wallet-type";
export {
  authCredentialSchema,
  type AuthCredential,
  type AlbedoCredential,
  type AppleCredential,
  type SignedChallengeCredential,
  type SocialProviderCredential,
} from "./session/auth-credentials";
export { custodialSignerSchema, type CustodialSigner } from "./session/custodial-signer";
export {
  assertSignerBelongsToSession,
  type SigningSessionUser,
} from "./session/assert-signer-belongs-to-session";
export {
  accountServiceResponseSchema,
  type AccountServiceResponse,
} from "./providers/custodial/account-service-schema";
export type { WadzzoSessionUser } from "./session/session-user";
