import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { api, ApiError, configureApi } from "~/lib/api/client";
import { whenNoSheet } from "~/lib/sheets";
import type { Profile, SessionUser } from "~/lib/api/types";
import { persistStorage } from "~/lib/storage";

import type { GateIntent } from "./gateCopy";

/**
 * ── Session ────────────────────────────────────────────────────────────────
 *
 * The wadzzoAR mobile token lives in SecureStore; the user object is cached
 * in AsyncStorage so every screen renders its signed-in state on the first
 * frame, exactly like the web's persisted `useAuth` — then `/auth/me`
 * confirms it in the background, and a 401 clears it quietly.
 *
 * Tokens never expire (decided), so there's no refresh loop.
 *
 * The gate: `requireAuth(intent, resume)` opens the sign-in sheet with the
 * web's copy for that intent and remembers `resume`, which runs as soon as
 * sign-in succeeds — the capture/follow/join the viewer tried goes through
 * without a second tap (docs/03-auth.md).
 */

const TOKEN_KEY = "wadzzo.session.token";

interface SessionState {
  user: SessionUser | null;
  token: string | null;
  hydrated: boolean;
  gate: GateIntent | null;
  /** User ids that have already seen the first-sign-in profile sheet. */
  onboarded: string[];
  /** Set right after a first sign-in; the sheet reads and clears it. */
  showOnboarding: boolean;

  hydrate: () => Promise<void>;
  setSession: (token: string, user: SessionUser) => Promise<void>;
  patchUser: (patch: Partial<SessionUser>) => void;
  signOut: () => Promise<void>;
  requireAuth: (intent: GateIntent, resume?: () => void) => boolean;
  closeGate: () => void;
  /** Hide the sheet but keep the pending action (moving to a sign-in screen). */
  hideGate: () => void;
  finishOnboarding: () => void;
}

let pendingResume: (() => void) | null = null;

/** A server-made placeholder name is the pubkey truncated ("GBP...24M"). */
const looksUnset = (u: SessionUser) => !u.image && (!u.name || /\.\.\./.test(u.name));

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      hydrated: false,
      gate: null,
      onboarded: [],
      showOnboarding: false,

      hydrate: async () => {
        const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
        if (!token) {
          set({ token: null, user: null, hydrated: true });
          return;
        }
        set({ token, hydrated: true });
        try {
          const me = await api<Profile>("/auth/me");
          get().patchUser({ name: me.name, email: me.email, image: me.image, walletType: me.walletType });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) await get().signOut();
          // Offline or server down: keep the cached user.
        }
      },

      setSession: async (token, user) => {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        const first = !get().onboarded.includes(user.id) && looksUnset(user);
        set({ token, user, gate: null, showOnboarding: first });
        const resume = pendingResume;
        pendingResume = null;
        // Let the sheet close fully before the resumed action runs (it may
        // navigate or open another sheet — see BottomSheet's whenNoSheet).
        if (resume) whenNoSheet(resume);
      },

      patchUser: (patch) => {
        const user = get().user;
        if (user) set({ user: { ...user, ...patch } });
      },

      signOut: async () => {
        const hadToken = get().token;
        set({ token: null, user: null, gate: null, showOnboarding: false });
        pendingResume = null;
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
        if (hadToken) {
          // Server-side no-op today (no revocation, by decision) — kept so
          // revocation can be switched on later without an app update.
          api("/auth/session", { method: "DELETE" }).catch(() => undefined);
        }
        const { signOutProviders } = await import("./signIn");
        await signOutProviders();
      },

      requireAuth: (intent, resume) => {
        if (get().user) return true;
        pendingResume = resume ?? null;
        set({ gate: intent });
        return false;
      },

      closeGate: () => {
        pendingResume = null;
        set({ gate: null });
      },

      hideGate: () => set({ gate: null }),

      finishOnboarding: () => {
        const id = get().user?.id;
        set((s) => ({
          showOnboarding: false,
          onboarded: id && !s.onboarded.includes(id) ? [...s.onboarded, id] : s.onboarded,
        }));
      },
    }),
    {
      name: "wadzzo-session",
      storage: persistStorage,
      // The token is NOT here — it's in SecureStore. Only the display cache.
      partialize: (s) => ({ user: s.user, onboarded: s.onboarded }),
    },
  ),
);

configureApi({
  getToken: () => useSession.getState().token,
  onUnauthorized: () => void useSession.getState().signOut(),
});
