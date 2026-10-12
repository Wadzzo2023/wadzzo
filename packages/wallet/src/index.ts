/** Client-side wallet API: connect UI, session state and transaction signing. */

// UI
export { ConnectWalletButton } from "./ui/connect-wallet-button";
export { ConnectWalletDialog } from "./ui/connect-wallet-dialog";

// state
export { useConnectWalletDialogStore } from "./state/connect-dialog-store";

// signing
export {
  signAndSubmitTransaction,
  type SignAndSubmitTransactionInput,
} from "./signing/sign-and-submit-transaction";
export { useCustodialSigner } from "./session/use-custodial-signer";
export { firebaseAuth } from "./firebase/client";

// everything that is also safe on the server (WalletType, schemas)
export * from "./shared";

// stellar helpers shared by every app
export {
  StellarTransactionError,
  describeStellarError,
  isRecoverableStellarError,
  summarizeStellarError,
} from "./errors/stellar-transaction-error";
export { isStellarAccountActive, submitSignedTransaction } from "./stellar/horizon";
export { concatAssetWithIssuer, splitAssetKey } from "./stellar/asset-keys";
