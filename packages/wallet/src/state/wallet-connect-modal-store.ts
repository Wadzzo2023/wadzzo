import { create } from "zustand";

interface WalletConnectModalState {
  /** While true the page renders WalletConnect's `<w3m-modal>` element, which the standalone modal needs in the DOM. */
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const useWalletConnectModalStore = create<WalletConnectModalState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),
}));
