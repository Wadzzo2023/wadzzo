/**
 * Per-platform "how to actually turn this on" steps, shared by every screen
 * that gates on location: `LocationGate` (map, directions) and
 * `ArPermissionGate` (the AR entry flow).
 *
 * Split out because both need the same answer to the same question, and
 * because once a browser has denied a site's location request it stops
 * re-prompting entirely — the fix lives several taps deep in OS settings, in
 * a different place on every platform, so the instructions are load-bearing
 * content, not a nice-to-have footnote.
 */

export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so the touch-point check is what
  // actually catches modern iPads.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (ua.includes("Android")) return "android";
  return "desktop";
}

export const LOCATION_STEPS: Record<Platform, { title: string; steps: string[] }> = {
  ios: {
    title: "On iPhone & iPad",
    steps: [
      "Open Settings › Privacy & Security › Location Services and make sure it's on.",
      "In the same list, tap your browser (Safari or Chrome) and choose “While Using the App”.",
      "Back in the browser, tap the ⓐA or ⋮ icon in the address bar › Website Settings › Location › Allow.",
      "Reload this page.",
    ],
  },
  android: {
    title: "On Android",
    steps: [
      "Swipe down and check the Location tile is on.",
      "Open Settings › Location › App permissions and allow your browser.",
      "In Chrome, tap the ⋮ menu › Settings › Site settings › Location and make sure it isn't blocked.",
      "Tap the padlock beside the address bar › Permissions › Location › Allow, then reload.",
    ],
  },
  desktop: {
    title: "On desktop",
    steps: [
      "Click the padlock or location icon beside the address bar and set Location to Allow.",
      "On macOS, also check System Settings › Privacy & Security › Location Services is on for your browser.",
      "Reload this page.",
    ],
  },
};
