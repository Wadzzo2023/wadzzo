/**
 * Every way a user can sign in and sign transactions.
 *
 * The string values are stored in sessions and the database, so they never
 * change, even where the spelling is odd (`freighter` keeps "frieghter").
 */
export enum WalletType {
  none = "none",
  /** Console admin acting on a brand's behalf: no wallet, the server signs. */
  isAdmin = "isAdmin",

  // ── non-custodial: the user's own wallet holds the keys ────────────────
  albedo = "albedo",
  freighter = "frieghter",
  xBull = "xBull",
  rabet = "rabet",
  hana = "hana",
  hotWallet = "hotWallet",
  metamask = "metamask",
  walletConnect = "walletConnect",

  // ── custodial: Wadzzo's accounts service holds the keys ────────────────
  emailPass = "emailPass",
  google = "google",
  facebook = "facebook",
  apple = "apple",
}

/** Accounts whose keys live in the Wadzzo accounts service (the server signs for them). */
export const CUSTODIAL_WALLET_TYPES: readonly WalletType[] = [
  WalletType.emailPass,
  WalletType.google,
  WalletType.facebook,
  WalletType.apple,
];

export const isCustodialWallet = (walletType: WalletType | string | null | undefined): boolean =>
  CUSTODIAL_WALLET_TYPES.includes(walletType as WalletType);

/** A transaction for these is already signed by the server and only needs submitting. */
export const isServerSignedWallet = (walletType: WalletType | string | null | undefined): boolean =>
  walletType === WalletType.isAdmin || isCustodialWallet(walletType);
