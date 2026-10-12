import { create } from "zustand";

interface ConnectDialogState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

/** Whether the connect-wallet dialog is open. Any component can open it. */
export const useConnectWalletDialogStore = create<ConnectDialogState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),
}));
