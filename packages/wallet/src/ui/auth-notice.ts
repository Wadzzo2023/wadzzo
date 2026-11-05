import toast from "react-hot-toast";

import { useConnectWalletDialogStore } from "../state/connect-dialog-store";

/**
 * Tells the user how a sign-in step went. While the connect dialog is open the
 * message is shown inside it, where they are looking: a toast is drawn at the top
 * of the screen over (or, on a phone, hidden behind) the dialog, vanishes after a
 * few seconds, and some apps mount no toast container at all. With the dialog
 * closed it falls back to a toast.
 */
function notify(type: "error" | "success", text: string): void {
  const { isOpen, setNotice } = useConnectWalletDialogStore.getState();
  if (isOpen) setNotice({ type, text });
  else if (type === "error") toast.error(text);
  else toast.success(text);
}

export function showAuthError(message: string): void {
  notify("error", message);
}

export function showAuthSuccess(message: string): void {
  notify("success", message);
}

/** Clears the dialog's message, e.g. when a new attempt starts. */
export function clearAuthNotice(): void {
  useConnectWalletDialogStore.getState().setNotice(null);
}
