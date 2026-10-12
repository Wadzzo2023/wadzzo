import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { persistStorage } from "~/lib/storage";

import type { ArSettings, Rarity } from "./types";

/**
 * ── Settings + feedback ────────────────────────────────────────────────────
 *
 * Settings mirror the web's `useSettings` (wadzzoAR/src/lib/ar/store.ts) with
 * the same defaults. Feedback mirrors `feedback.ts`: the capture chime and
 * proximity blip are the web's own synthesized notes, pre-rendered to WAV by
 * scripts/gen-sounds.mjs; the web's vibration patterns become native haptics
 * (which, unlike the Vibration API, also work on iOS).
 */

export const DEFAULT_SETTINGS: ArSettings = {
  autoCollect: false,
  followingOnly: false,
  haptics: true,
  sound: true,
  compassMode: false,
};

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
    { name: "wadzzo-settings", storage: persistStorage },
  ),
);

export function useFeedbackSettings() {
  const haptics = useSettings((s) => s.haptics);
  const sound = useSettings((s) => s.sound);
  return { haptics, sound };
}

const SOURCES: Record<Rarity | "blip" | "focus", number> = {
  common: require("../../../assets/sounds/chime-common.wav"),
  rare: require("../../../assets/sounds/chime-rare.wav"),
  epic: require("../../../assets/sounds/chime-epic.wav"),
  legendary: require("../../../assets/sounds/chime-legendary.wav"),
  mythic: require("../../../assets/sounds/chime-mythic.wav"),
  blip: require("../../../assets/sounds/blip.wav"),
  // Same blip, played softer: "you're aiming at a pin" (vs. the full blip
  // for "…and you can capture it").
  focus: require("../../../assets/sounds/blip.wav"),
};
const VOLUME: Partial<Record<keyof typeof SOURCES, number>> = { focus: 0.45 };

const players = new Map<string, AudioPlayer>();
function play(key: keyof typeof SOURCES) {
  try {
    let p = players.get(key);
    if (!p) {
      p = createAudioPlayer(SOURCES[key]);
      p.volume = VOLUME[key] ?? 1;
      players.set(key, p);
    }
    void p.seekTo(0);
    p.play();
  } catch {
    // Audio is decoration — never let it break a capture.
  }
}

/**
 * Create the tap "blip" player ahead of time (called once after launch), so
 * the first tab/button tap doesn't pay for loading audio on the JS thread.
 */
export function warmFeedbackSounds() {
  try {
    if (!players.has("blip")) players.set("blip", createAudioPlayer(SOURCES.blip));
    if (!players.has("focus")) {
      const p = createAudioPlayer(SOURCES.focus);
      p.volume = VOLUME.focus ?? 1;
      players.set("focus", p);
    }
  } catch {
    // decoration only
  }
}

/** The web's HAPTIC_CAPTURE [18, 40, 28] ms: tap … pause … tap. */
async function captureHaptic() {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 58);
}

export function useFeedback() {
  const { haptics, sound } = useFeedbackSettings();

  const captured = useCallback(
    (rarity: Rarity) => {
      if (haptics) void captureHaptic();
      if (sound) play(rarity);
    },
    [haptics, sound],
  );

  const cameIntoRange = useCallback(() => {
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (sound) play("blip");
  }, [haptics, sound]);

  /** Aimed at a pin in AR (any pin): a light tick and a soft blip. */
  const focused = useCallback(() => {
    if (haptics) void Haptics.selectionAsync();
    if (sound) play("focus");
  }, [haptics, sound]);

  const tap = useCallback(() => {
    if (haptics) void Haptics.selectionAsync();
  }, [haptics]);

  return { captured, cameIntoRange, focused, tap };
}
