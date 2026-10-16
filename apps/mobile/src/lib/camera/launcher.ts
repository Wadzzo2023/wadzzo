import { create } from "zustand";

/**
 * Whether the camera launcher dialog (AR · QR · Murals) is open. The AR
 * button in the tab bar opens it; it's mounted once, in the tabs layout.
 */
export const useCameraLauncher = create<{ open: boolean; show: () => void; hide: () => void }>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
