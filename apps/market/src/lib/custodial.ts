import { WalletType } from "@wadzzo/wallet/shared";

const CUSTODIAL = new Set<WalletType>([
  WalletType.emailPass,
  WalletType.google,
  WalletType.facebook,
  WalletType.apple,
]);

/** Email/social logins: the platform holds the keys and signs for them. Wallet users sign in their own wallet. */
export const isCustodial = (walletType: WalletType | null | undefined) =>
  Boolean(walletType && CUSTODIAL.has(walletType));
