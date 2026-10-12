import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

import { useSettings } from "~/lib/ar/feedback";

/**
 * ── Murals sound + haptics (mobile) ────────────────────────────────────────
 *
 * Same cues as wadzzoAR `src/lib/murals/sfx.ts`. The WAVs in assets/sounds
 * are rendered from the web's exact notes and envelopes (generated
 * 2026-10-05), so both apps sound identical. Respects Settings › Sound /
 * Haptics.
 */

const SOURCES = {
  lock: require("../../../assets/sounds/mural-lock.wav"),
  capture: require("../../../assets/sounds/mural-capture.wav"),
  ready: require("../../../assets/sounds/mural-pack-ready.wav"),
} as const;

const players = new Map<keyof typeof SOURCES, AudioPlayer>();
function play(key: keyof typeof SOURCES) {
  if (!useSettings.getState().sound) return;
  try {
    let p = players.get(key);
    if (!p) {
      p = createAudioPlayer(SOURCES[key]);
      players.set(key, p);
    }
    void p.seekTo(0);
    p.play();
  } catch {
    // Sound is decoration; never let it break the flow.
  }
}

const haptic = (run: () => Promise<void>) => {
  if (useSettings.getState().haptics) void run().catch(() => undefined);
};

export const sfx = {
  /** Outline snaps onto a mural. */
  lock() {
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    play("lock");
  },
  /** A keyframe is taken at a sweep stop. */
  capture() {
    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
    play("capture");
  },
  /** Every few degrees of turn — barely there. */
  tick() {
    haptic(() => Haptics.selectionAsync());
  },
  /** The mural pack finished installing. */
  packReady() {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    play("ready");
  },
};
