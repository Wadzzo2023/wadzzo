/**
 * Mirrors wadzzoAR/tailwind.config.ts so class names port from the web
 * unchanged. Colours are `rgb(var(--token) / <alpha-value>)`; the variables
 * are set per theme by <ThemeRoot> (src/theme/ThemeRoot.tsx) from the
 * generated src/theme/tokens.ts.
 *
 * Fonts: `font-hud` / `font-body` / `font-creator` resolve to a family *role*;
 * <Text> (src/components/ui/Text.tsx) maps role + weight to the actual loaded
 * font file, since React Native can't pick a weight inside a custom family.
 *
 * @type {import('tailwindcss').Config}
 */
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        hud: ["hud"],
        body: ["body"],
        creator: ["creator"],
      },
      colors: {
        ar: {
          void: c("ar-void"),
          bg: c("ar-bg"),
          surface: c("ar-surface"),
          "surface-2": c("ar-surface-2"),
          "surface-3": c("ar-surface-3"),
          line: c("ar-line"),
          "line-bright": c("ar-line-bright"),
          text: c("ar-text"),
          dim: c("ar-text-dim"),
          faint: c("ar-text-faint"),
          green: c("ar-green"),
          "green-hot": c("ar-green-hot"),
          "green-deep": c("ar-green-deep"),
          "green-ink": c("ar-green-ink"),
          danger: c("ar-danger"),
          locked: c("ar-locked"),
        },
        rarity: {
          common: c("rarity-common"),
          rare: c("rarity-rare"),
          epic: c("rarity-epic"),
          legendary: c("rarity-legendary"),
          mythic: c("rarity-mythic"),
        },
      },
      borderRadius: {
        "ar-sm": "10px",
        ar: "16px",
        "ar-lg": "22px",
        "ar-xl": "30px",
      },
    },
  },
  plugins: [],
};
