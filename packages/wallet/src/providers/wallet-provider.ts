import type { WalletType } from "../wallet-type";

/**
 * One way of signing in and signing transactions. Every wallet, custodial or
 * not, is exposed through this, so the dialog and `signAndSubmitTransaction`
 * never special-case a wallet.
 */
export interface WalletProvider {
  readonly type: WalletType;
  /** Name shown on the connect button, e.g. "Freighter". */
  readonly label: string;
  /** Interactive sign-in: opens the wallet, creates the session, shows toasts. */
  login(): Promise<void>;
  /**
   * Signs `xdr` and gets it onto the network.
   * Resolves `false` if the user didn't sign; throws `StellarTransactionError` if Stellar refuses it.
   */
  signAndSubmit(xdr: string, publicKey: string): Promise<boolean>;
}

/**
 * What a browser-extension (or app) wallet has to provide. `createExtensionProvider`
 * turns this into a full `WalletProvider` with the shared sign-in and signing flow.
 */
export interface ExtensionWallet {
  readonly type: WalletType;
  readonly label: string;
  /** Asks the wallet for its public key. Throws an `AppError` with a user-facing message. */
  connect(): Promise<string>;
  /** Returns the signed XDR. Throws an `AppError` if the user declines. */
  signTransaction(xdr: string, publicKey: string): Promise<string>;
}
