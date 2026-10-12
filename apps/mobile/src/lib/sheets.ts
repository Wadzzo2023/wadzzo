/*
 * ── One native modal at a time ──
 * Each sheet is a React Native <Modal>, i.e. a real UIKit presentation.
 * Presenting anything (another sheet, a modal route like /auth/sign-in)
 * while a sheet is still up or closing stacks it ON the sheet; when the
 * sheet finishes closing UIKit dismisses it and everything above it, and
 * the app is left with navigation state that no longer matches the screen
 * — an invisible layer swallowing every tap. So: sheets queue behind each
 * other, and `whenNoSheet` defers work until the last one is really gone.
 */
let sheetsUp = 0;
let waiters: (() => void)[] = [];
/** A beat after unmount for UIKit to finish tearing the modal down. */
const SETTLE_MS = 60;

export function sheetMounted() {
  sheetsUp += 1;
}
export function sheetUnmounted() {
  sheetsUp = Math.max(0, sheetsUp - 1);
  if (sheetsUp > 0) return;
  setTimeout(() => {
    if (sheetsUp > 0) return;
    const run = waiters;
    waiters = [];
    run.forEach((fn) => fn());
  }, SETTLE_MS);
}

/** Run `fn` once no bottom sheet is on screen (immediately if none is). */
export function whenNoSheet(fn: () => void) {
  if (sheetsUp === 0) fn();
  else waiters.push(fn);
}
