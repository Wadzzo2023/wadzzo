import { useIsFocused } from "expo-router";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

/**
 * ── Decorative motion ──────────────────────────────────────────────────────
 *
 * Endless loops (sonar pulses, shimmer, bobbing pins, spinning rings) keep
 * the GPU drawing every frame for as long as they run. They should only run
 * when someone can see them and the phone can afford it:
 *
 *  - Reduce Motion is off
 *  - Low Power Mode is off
 *  - the app is in the foreground
 *  - the screen they're on is focused (not covered by another screen)
 *
 * App state and Low Power Mode are one shared subscription each (dozens of
 * pins use this hook), exposed through useSyncExternalStore.
 */

type BatteryModule = {
  isLowPowerModeEnabledAsync: () => Promise<boolean>;
  addLowPowerModeListener: (cb: (e: { lowPowerMode: boolean }) => void) => { remove: () => void };
};

// expo-battery is native: until the dev build is rebuilt with it, the import
// throws. Then Low Power Mode simply isn't considered.
let Battery: BatteryModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Battery = require("expo-battery") as BatteryModule;
} catch {
  Battery = null;
}

let appActive = AppState.currentState !== "background";
let lowPower = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AppState.addEventListener("change", (s) => {
  const next = s === "active";
  if (next !== appActive) {
    appActive = next;
    emit();
  }
});
if (Battery) {
  Battery.isLowPowerModeEnabledAsync()
    .then((v) => {
      lowPower = v;
      emit();
    })
    .catch(() => undefined);
  Battery.addLowPowerModeListener(({ lowPowerMode }) => {
    lowPower = lowPowerMode;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const ambientSnapshot = () => appActive && !lowPower;

/** Motion allowed app-wide (no screen check) — for things outside a screen. */
export function useAmbientMotion() {
  const reduced = useReducedMotion();
  const ok = useSyncExternalStore(subscribe, ambientSnapshot);
  return ok && !reduced;
}

/** Motion allowed for a loop on the current screen. Use inside screens only. */
export function useDecorativeMotion() {
  const ambient = useAmbientMotion();
  const focused = useIsFocused();
  return ambient && focused;
}
