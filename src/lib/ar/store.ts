import { signOut as nextAuthSignOut } from "next-auth/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Deep import, not the package barrel — `useDialogStore` is the wallet
// dialog's own visibility switch and isn't re-exported from
// `package/connect_wallet`'s public index, same as the deep imports
// src/server/auth.ts already makes into this submodule.
import { useDialogStore } from "package/connect_wallet/src/state/connect_wallet_dialog";

import { nonBlank } from "~/lib/utils";
import { truncateString } from "~/utils/string";
import { DEFAULT_SETTINGS } from "./mock";
import type { ArSettings, ArUser } from "./types";

/**
 * ── App state ──────────────────────────────────────────────────────────────
 *
 * `user` here is a mirror of the real NextAuth session, kept in sync by
 * `<SessionSync>` (mounted once in `_app.tsx`) rather than by anything in
 * this file — `store.ts` doesn't call `useSession()` itself so that every
 * screen's `useAuth((s) => s.user)` stays a plain, cheap zustand selector
 * instead of a hook that re-renders on every session poll.
 *
 * `signIn` no longer sets a user directly — signing in is now genuinely
 * asynchronous (a wallet popup, an email round-trip), so all it does is open
 * the real chooser from the connect_wallet submodule. `signOut` calls
 * NextAuth's own signOut; the resulting `unauthenticated` session state is
 * what actually clears `user`, via SessionSync, once the cookie is gone.
 */

interface AuthState {
  user: ArUser | null;
  /** Why the gate opened — copy changes per intent. */
  gate: GateIntent | null;
  signIn: () => void;
  signOut: () => void;
  /** Open the login gate. Returns false if the action should be blocked. */
  requireAuth: (intent: GateIntent) => boolean;
  closeGate: () => void;
  /** SessionSync-only: pushes the real session in, or clears it. */
  setUser: (user: ArUser | null) => void;
}

/**
 * NextAuth's session only carries what `src/server/auth.ts`'s callbacks put
 * on the JWT — id (the Stellar pubkey), walletType, emailVerified. Everything
 * richer in `ArUser` (collection count, brands followed, distance travelled,
 * balance) needs a real profile query, which doesn't exist until the backend
 * milestone lands. Those fields are honestly zeroed here rather than faked,
 * so a genuinely-authenticated user with no data yet reads as "new", not as
 * a demo account.
 */
function deriveArUser(sessionUser: {
  id: string;
  name?: string | null;
  image?: string | null;
}): ArUser {
  const id = sessionUser.id;
  return {
    id,
    name: nonBlank(sessionUser.name) ?? truncateString(id, 6, 4),
    handle: truncateString(id, 4, 4).toLowerCase(),
    avatarUrl: nonBlank(sessionUser.image) ?? "/brand/wadzzo-mark.png",
    pubkey: truncateString(id, 4, 4).toUpperCase(),
    joinedAt: new Date().toISOString(),
    collectedCount: 0,
    brandsFollowed: 0,
    distanceTravelled: 0,
    balance: 0,
  };
}

export { deriveArUser };

export type GateIntent =
  | "collect"
  | "follow"
  | "profile"
  | "settings"
  | "redeem"
  | "ar"
  | "bounty"
  | "events";

export const GATE_COPY: Record<GateIntent, { title: string; body: string }> = {
  collect: {
    title: "Sign in to collect",
    body: "You're standing close enough — you just need a wallet to keep what you capture.",
  },
  follow: {
    title: "Sign in to follow",
    body: "Following a brand puts their private drops on your map and keeps their pins at the top.",
  },
  profile: {
    title: "Sign in to see your profile",
    body: "Your collection, your stats, and your redeem codes all live behind your wallet.",
  },
  settings: {
    title: "Sign in to change settings",
    body: "Auto-collect and map preferences are saved to your account.",
  },
  redeem: {
    title: "Sign in to redeem",
    body: "Redeem codes are tied to the wallet that collected the pin.",
  },
  bounty: {
    title: "Sign in to take part",
    body: "Joining a bounty, sending an entry and talking to the brand all happen from your wallet — it's also where any reward lands.",
  },
  events: {
    title: "Sign in to join in",
    body: "RSVPs and comments are saved to your account, so the brand knows who's coming.",
  },
  ar: {
    title: "Sign in to capture",
    body: "Look around in AR as much as you like — capturing a pin needs an account.",
  },
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      gate: null,
      signIn: () => {
        set({ gate: null });
        useDialogStore.getState().setIsOpen(true);
      },
      signOut: () => {
        void nextAuthSignOut({ redirect: false });
      },
      requireAuth: (intent) => {
        if (get().user) return true;
        set({ gate: intent });
        return false;
      },
      closeGate: () => set({ gate: null }),
      setUser: (user) => set({ user }),
    }),
    {
      name: "wadzzo-ar-session",
      // Only the identity survives a reload — exactly what a real NextAuth
      // cookie does. `gate` is transient UI and must never come back open.
      // It's a cache, not the source of truth: SessionSync corrects it the
      // moment the real cookie disagrees, so a cleared cookie can't leave a
      // stale "signed in" user stranded here.
      partialize: (s) => ({ user: s.user }),
    },
  ),
);

// ─── Settings ────────────────────────────────────────────────────────────────

interface SettingsState extends ArSettings {
  set: <K extends keyof ArSettings>(key: K, value: ArSettings[K]) => void;
  toggle: (key: keyof ArSettings) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<SettingsState>),
    }),
    { name: "wadzzo-ar-settings" },
  ),
);

// ─── Session-scoped UI state ─────────────────────────────────────────────────

export type PinFilter = "all" | "following" | "collectible" | "collected";

interface MapUiState {
  filter: PinFilter;
  setFilter: (f: PinFilter) => void;
  /** Pin currently open in the map's detail sheet. */
  selectedPinId: string | null;
  selectPin: (id: string | null) => void;
  /** Pins claimed this session by auto-collect, for the toast queue. */
  autoCollected: string[];
  pushAutoCollected: (id: string) => void;
  clearAutoCollected: () => void;
}

export const useMapUi = create<MapUiState>()((set) => ({
  filter: "all",
  setFilter: (filter) => set({ filter }),
  selectedPinId: null,
  selectPin: (selectedPinId) => set({ selectedPinId }),
  autoCollected: [],
  pushAutoCollected: (id) =>
    set((s) =>
      s.autoCollected.includes(id)
        ? s
        : { autoCollected: [...s.autoCollected, id] },
    ),
  clearAutoCollected: () => set({ autoCollected: [] }),
}));

/**
 * Whether the boot sequence has already played. Kept in module scope rather
 * than storage on purpose: it replays on a fresh tab (which is where the
 * first impression matters) but not when navigating back to the map.
 */
let bootPlayed = false;
export const hasBooted = () => bootPlayed;
export const markBooted = () => {
  bootPlayed = true;
};
