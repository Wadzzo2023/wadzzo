import { create } from "zustand";

/** What the signed-in profile card shows; the app fills it from its own user query. */
export interface DialogProfile {
  name?: string | null;
  image?: string | null;
  coverImage?: string | null;
}

interface ConnectDialogState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  /** The signed-in user's profile (avatar, cover), or null to fall back to the session. */
  profile: DialogProfile | null;
  setProfile: (profile: DialogProfile | null) => void;
}

/** Whether the connect-wallet dialog is open, and whose profile it shows. Any component can open it. */
export const useConnectWalletDialogStore = create<ConnectDialogState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),
  profile: null,
  setProfile: (profile) => set({ profile }),
}));
