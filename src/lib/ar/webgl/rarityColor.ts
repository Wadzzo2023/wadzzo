import type { Rarity } from "~/lib/ar/types";

/**
 * The rarity palette as literal `[h, s, l]` triplets, for `THREE.Color`.
 *
 * The single source of truth is `--rarity-*` in `src/styles/arcade.css`, in
 * the same `H S% L%` form. Three.js can't resolve a CSS custom property —
 * `THREE.Color`'s string parser has no notion of `var(--x)` — so this mirrors
 * the values numerically, the same way `tailwind.config.ts` already mirrors
 * them into `hsl(var(--rarity-common))` for its own consumer. Keep the two in
 * sync by hand; there's no way to derive one from the other at build time
 * without a much bigger tooling investment than five colours justifies.
 */
export const RARITY_HSL: Record<Rarity, [number, number, number]> = {
  common: [195, 0.08, 0.62],
  rare: [192, 0.88, 0.56],
  epic: [272, 0.82, 0.66],
  legendary: [42, 0.96, 0.56],
  mythic: [320, 0.9, 0.64],
};
