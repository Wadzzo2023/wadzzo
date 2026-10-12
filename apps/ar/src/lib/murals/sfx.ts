import { audioContext, vibrate } from "~/lib/ar/feedback";
import { useSettings } from "~/lib/ar/store";

/**
 * ── Murals sound + haptics ─────────────────────────────────────────────────
 *
 * Synthesised (WebAudio) like the rest of the app's feedback, so there are no
 * audio files to load. Every call respects Settings › Sound / Haptics.
 */

type Note = { hz: number; at: number; dur: number; gain?: number; type?: OscillatorType };

function play(notes: Note[]) {
  if (!useSettings.getState().sound) return;
  const audio = audioContext();
  if (!audio) return;
  try {
    const now = audio.currentTime;
    for (const n of notes) {
      const osc = audio.createOscillator();
      const g = audio.createGain();
      osc.type = n.type ?? "triangle";
      osc.frequency.value = n.hz;
      const start = now + n.at;
      const end = start + n.dur;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(n.gain ?? 0.12, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g).connect(audio.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  } catch {
    // Sound is decoration; never let it break the flow.
  }
}

const buzz = (pattern: number | number[]) => vibrate(pattern, useSettings.getState().haptics);

export const sfx = {
  /** Brackets snap onto a mural: a quick rising two-tone. */
  lock() {
    buzz([12, 30, 18]);
    play([
      { hz: 660, at: 0, dur: 0.09 },
      { hz: 990, at: 0.07, dur: 0.14 },
    ]);
  },
  /** A keyframe is taken at a sweep stop: a short shutter tick. */
  capture() {
    buzz(22);
    play([
      { hz: 1800, at: 0, dur: 0.03, type: "square", gain: 0.05 },
      { hz: 1200, at: 0.03, dur: 0.05, type: "square", gain: 0.04 },
    ]);
  },
  /** Every few degrees of turn — barely there. */
  tick() {
    buzz(6);
  },
  /** The mural pack finished installing: a little fanfare. */
  packReady() {
    buzz([20, 40, 20, 40, 40]);
    play([
      { hz: 523.25, at: 0, dur: 0.16 },
      { hz: 659.25, at: 0.1, dur: 0.16 },
      { hz: 783.99, at: 0.2, dur: 0.16 },
      { hz: 1046.5, at: 0.3, dur: 0.42, gain: 0.14 },
    ]);
  },
};
