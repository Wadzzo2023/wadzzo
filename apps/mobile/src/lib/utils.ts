import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's built-in radius names, so it kept both
 * `rounded-ar` and `rounded-full` (or `rounded-ar-lg`) when a component's
 * default met a caller's override — and the wrong one could win (pill-shaped
 * skeleton bars rendered as 16px boxes). Register the app's custom radii
 * (tailwind.config.js) so the later class replaces the earlier one.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { borderRadius: ["ar-sm", "ar", "ar-lg", "ar-xl"] } },
});

/** Same helper as the web's `~/lib/utils` — merge Tailwind classes safely. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
