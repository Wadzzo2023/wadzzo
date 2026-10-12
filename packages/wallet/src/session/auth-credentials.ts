import { z } from "zod";

import { WalletType } from "../wallet-type";

/** Sign-in with Albedo: it signs a one-time token instead of a transaction. */
export const albedoCredentialSchema = z.object({
  walletType: z.literal(WalletType.albedo),
  pubkey: z.string(),
  signature: z.string(),
  token: z.string(),
  fromAppSign: z.string().optional(),
});

export const emailPasswordCredentialSchema = z.object({
  walletType: z.literal(WalletType.emailPass),
  email: z.string(),
  password: z.string(),
  fromAppSign: z.string().optional(),
});

/** Sign-in with a wallet that signs a server-issued challenge transaction. */
export const signedChallengeCredentialSchema = z.object({
  walletType: z.union([
    z.literal(WalletType.freighter),
    z.literal(WalletType.rabet),
    z.literal(WalletType.walletConnect),
    z.literal(WalletType.metamask),
    z.literal(WalletType.xBull),
    z.literal(WalletType.hana),
    z.literal(WalletType.hotWallet),
  ]),
  pubkey: z.string(),
  signedXDR: z.string(),
  fromAppSign: z.string().optional(),
});

/** Sign-in with a Firebase social provider (Google, Facebook). */
export const socialProviderCredentialSchema = z.object({
  email: z.string(),
  token: z.string(),
  walletType: z.union([z.literal(WalletType.google), z.literal(WalletType.facebook)]),
  fromAppSign: z.string().optional(),
});

export const appleCredentialSchema = z.object({
  walletType: z.literal(WalletType.apple),
  token: z.string().optional(),
  email: z.string(),
  appleToken: z.string().optional(),
  fromAppSign: z.string().optional(),
});

export const authCredentialSchema = z.union([
  albedoCredentialSchema,
  emailPasswordCredentialSchema,
  socialProviderCredentialSchema,
  signedChallengeCredentialSchema,
  appleCredentialSchema,
]);

export type AuthCredential = z.infer<typeof authCredentialSchema>;
export type AlbedoCredential = z.infer<typeof albedoCredentialSchema>;
export type SignedChallengeCredential = z.infer<typeof signedChallengeCredentialSchema>;
export type SocialProviderCredential = z.infer<typeof socialProviderCredentialSchema>;
export type AppleCredential = z.infer<typeof appleCredentialSchema>;
