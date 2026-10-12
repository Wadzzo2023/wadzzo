import { albedoProvider } from "./extension/albedo";
import { freighterProvider } from "./extension/freighter";
import { hanaProvider } from "./extension/hana";
import { hotWalletProvider } from "./extension/hot-wallet";
import { metamaskProvider } from "./extension/metamask";
import { rabetProvider } from "./extension/rabet";
import { walletConnectProvider } from "./extension/wallet-connect";
import { xbullProvider } from "./extension/xbull";
import { adminProvider, emailPasswordProvider } from "./custodial/email-password-provider";
import { appleProvider, facebookProvider, googleProvider } from "./custodial/social-sign-in";
import type { WalletProvider } from "./wallet-provider";

/** Wallets users can connect from the "Stellar wallet" tab, in display order. */
export const NON_CUSTODIAL_PROVIDERS: readonly WalletProvider[] = [
  freighterProvider,
  rabetProvider,
  albedoProvider,
  xbullProvider,
  hanaProvider,
  metamaskProvider,
  hotWalletProvider,
];

const ALL_PROVIDERS: readonly WalletProvider[] = [
  ...NON_CUSTODIAL_PROVIDERS,
  walletConnectProvider,
  emailPasswordProvider,
  googleProvider,
  appleProvider,
  facebookProvider,
  adminProvider,
];

const providersByType = new Map<string, WalletProvider>(
  ALL_PROVIDERS.map((provider) => [provider.type, provider]),
);

/** The provider for a wallet type, or `undefined` for types that can't sign (e.g. "none"). */
export const getWalletProvider = (walletType: string): WalletProvider | undefined =>
  providersByType.get(walletType);
