"use client";

/**
 * The wallet's browser API: connect UI, signing and the hooks that go with it.
 * Server code and anything without UI imports the narrower entries instead:
 * `/shared`, `/stellar`, `/firebase`, `/config`, `/server`.
 */

// UI
export { ConnectWalletButton } from "./ui/connect-wallet-button";
export { ConnectWalletDialog } from "./ui/connect-wallet-dialog";
export { ConnectWalletPopups } from "./ui/connect-wallet-popups";

// state
export { useConnectWalletDialogStore } from "./state/connect-dialog-store";

// signing
export {
  signAndSubmitTransaction,
  type SignAndSubmitTransactionInput,
} from "./signing/sign-and-submit-transaction";
export { useCustodialSigner } from "./session/use-custodial-signer";
