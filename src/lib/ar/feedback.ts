import { useCallback } from "react";

import { useSettings } from "./store";
import type { Rarity } from "./types";

/**
 * ── Haptics & sound ────────────────────────────────────────────────────────
 *
 * The two "did that land?" channels behind the Haptics and Sound settings.
 *
 * Both are best-effort and deliberately silent on failure. Feedback is a
 * garnish on an action that already succeeded — a capture is recorded whether
 * or not the phone buzzed — so nothing here may throw, block, or surface an
 * error to a viewer who is mid-celebration.
 *
 * ## Why the audio is synthesised rather than played from files
 *
 * There are no sound assets in this project, and adding a handful of `.mp3`s
 * for a two-note chime would mean binaries in the repo, a loading state before
 * the first capture can be acknowledged, and a cache miss at exactly the wrong
 * moment. A short WebAudio envelope costs nothing to ship, plays instantly,
 * and lets the *rarity* pick the interval — so a mythic pull genuinely sounds
 * different from a common one rather than replaying one generic ding.
 *
 * ## Autoplay
 *
 * Browsers refuse to start an `AudioContext` outside a user gesture, and iOS
 * suspends one that was created too early. The context is therefore created
 * lazily on first use — which is always inside a tap or a capture the viewer
 * caused — and `resume()`d each time, since it can be suspended again whenever
 * the tab is backgrounded.
 */

let ctx: AudioContext | null = null;

/** The shared AudioContext, created on first real use. Null if unsupported. */
function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    // Older iOS Safari only exposes the prefixed constructor.
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    // Safari suspends the context whenever the tab loses focus; without this
    // the first capture after coming back would be silent.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Semitone offsets above the root for each rarity's capture chime.
 *
 * A rising major arpeggio, widening as rarity climbs: common is a bare fifth,
 * mythic an octave-plus-third spread over four notes. The point is that the
 * *shape* carries the information — someone learns what a legendary sounds
 * like without being told, the same way the rarity colours work.
 */
const CHIME_INTERVALS: Record<Rarity, number[]> = {
  common: [0, 7],
  rare: [0, 4, 7],
  epic: [0, 4, 7, 11],
  legendary: [0, 5, 9, 14],
  mythic: [0, 7, 12, 16],
};

/** Gap between the chime's notes, ms. Shared with the settings test readout so
 *  its bars light in step with what you're actually hearing. */
export const CHIME_NOTE_MS = 75;

/** How many notes this rarity's chime plays. */
export function chimeNoteCount(rarity: Rarity): number {
  return CHIME_INTERVALS[rarity].length;
}

/** Root of the chime, Hz. A5 — high enough to cut through street noise. */
const CHIME_ROOT_HZ = 880;

/**
 * Play the capture chime for a rarity. No-op when sound is off or the browser
 * has no usable audio.
 */
export function playCaptureChime(rarity: Rarity, enabled: boolean) {
  if (!enabled) return;
  const audio = audioContext();
  if (!audio) return;

  try {
    const now = audio.currentTime;
    const intervals = CHIME_INTERVALS[rarity];

    intervals.forEach((semitones, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();

      // Triangle rather than sine: a touch more harmonic content, so it stays
      // audible on a phone speaker without needing to be louder.
      osc.type = "triangle";
      osc.frequency.value = CHIME_ROOT_HZ * Math.pow(2, semitones / 12);

      const start = now + (i * CHIME_NOTE_MS) / 1000;
      const end = start + 0.28;

      // Percussive envelope — near-instant attack, exponential decay. A hard
      // stop at zero would click, hence the tiny non-zero floor that
      // `exponentialRampToValueAtTime` requires anyway.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  } catch {
    // An audio glitch must never take down a capture.
  }
}

/** A short blip for a pin entering range — quieter and simpler than a capture. */
export function playProximityBlip(enabled: boolean) {
  if (!enabled) return;
  const audio = audioContext();
  if (!audio) return;

  try {
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = "sine";
    osc.frequency.value = CHIME_ROOT_HZ;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch {
    // Ignored, as above.
  }
}

/**
 * Buzz, if the device can and the setting allows.
 *
 * **iOS Safari does not implement the Vibration API at all** — `navigator
 * .vibrate` is simply absent there, and no permission or workaround changes
 * that. This is a real limitation of the platform, not a gap in this code: on
 * an iPhone the Haptics setting will do nothing, while on Android it works.
 * The feature-detect below means that costs nothing; it just quietly does
 * less on half the devices this app targets.
 */
export function vibrate(pattern: number | number[], enabled: boolean) {
  if (!enabled) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when the document isn't visible. Not worth caring.
  }
}

/** Whether this browser implements the Vibration API at all. */
export function canVibrate(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
  );
}

/**
 * The audio pipeline's state: `"unsupported"` when there's no usable
 * `AudioContext`, otherwise the context's own state — `"running"` once a user
 * gesture has unlocked it, `"suspended"` before that.
 */
export function audioSupport(): "unsupported" | AudioContextState {
  const audio = audioContext();
  return audio ? audio.state : "unsupported";
}

/**
 * What a feedback attempt actually did — the honest version, for the settings
 * screen's test button.
 *
 * Both channels can fail invisibly: sound is muted by a hardware switch or a
 * suspended context, and vibration simply doesn't exist on iOS Safari. Without
 * a readout, "I pressed test and felt nothing" is indistinguishable between a
 * broken setting, a silenced phone, and a platform that was never going to
 * buzz. This says which.
 */
export interface FeedbackReport {
  soundEnabled: boolean;
  audio: "unsupported" | AudioContextState;
  hapticsEnabled: boolean;
  hapticsSupported: boolean;
  /** Notes in the chime that was played, for the visualiser. */
  notes: number;
}

/** A capture landed: a double pulse, distinct from the single proximity tap. */
export const HAPTIC_CAPTURE: number[] = [18, 40, 28];
/** A pin came into range: one short tap. */
export const HAPTIC_PROXIMITY = 14;

/**
 * The feedback calls with the viewer's Haptics and Sound settings already
 * bound in, so call sites express *what happened* rather than re-checking two
 * preferences every time.
 *
 * Reads the two flags with separate selectors: a `useSettings()` with no
 * selector re-renders its component on every settings change, and the screens
 * that fire feedback (the map, the AR scene) are the most render-sensitive in
 * the app.
 */
export function useFeedback() {
  const haptics = useSettings((s) => s.haptics);
  const sound = useSettings((s) => s.sound);

  /** A pin was successfully captured. */
  const captured = useCallback(
    (rarity: Rarity) => {
      vibrate(HAPTIC_CAPTURE, haptics);
      playCaptureChime(rarity, sound);
    },
    [haptics, sound],
  );

  /** A pin just came within capture range. */
  const cameIntoRange = useCallback(() => {
    vibrate(HAPTIC_PROXIMITY, haptics);
    playProximityBlip(sound);
  }, [haptics, sound]);

  /**
   * Fire the capture feedback and report what genuinely happened, so the
   * settings screen can show it rather than leaving the viewer guessing.
   * Called from a real tap, which is also what unlocks the AudioContext.
   */
  const test = useCallback(
    (rarity: Rarity): FeedbackReport => {
      vibrate(HAPTIC_CAPTURE, haptics);
      playCaptureChime(rarity, sound);
      return {
        soundEnabled: sound,
        audio: audioSupport(),
        hapticsEnabled: haptics,
        hapticsSupported: canVibrate(),
        notes: chimeNoteCount(rarity),
      };
    },
    [haptics, sound],
  );

  return { captured, cameIntoRange, test };
}
