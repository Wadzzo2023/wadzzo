import {
  Bungee_Shade,
  Chakra_Petch,
  Cormorant_Upright,
  Sora,
} from "next/font/google";

/**
 * ── Wadzzo AR type system ──────────────────────────────────────────────────
 *
 * Two families do all the work, the way a game HUD does it:
 *
 *  · Chakra Petch — angular, slightly condensed, with tabular-feeling numerals.
 *    Carries every piece of chrome: tab labels, stat counters, distance
 *    readouts, rarity plates, buttons. Its cut edges read as "interface"
 *    rather than "document", which is the whole point.
 *
 *  · Sora — geometric, generous x-height, very legible at 13-15px on a phone
 *    in daylight. Carries prose: pin descriptions, brand bios, help text.
 *
 * Both are variable-weight-friendly on Google Fonts and subset to latin only,
 * so the boot sequence isn't waiting on a 300kB font payload.
 */

export const displayFont = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-display",
});

export const bodyFont = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-body",
});

/**
 * Stylish display font for hero / creator-title rendering.
 * Imported here (rather than in _app.tsx) so component-level usage
 * (CreatorInfoPanel, etc.) can apply the className directly without
 * threading props through the Layout.
 */
export const creatorTitleFont = Bungee_Shade({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-creator-title",
});

/**
 * Refined serif for the creator-description paragraph. Pairs with
 * Michroma (geometric / futuristic) to give the panel a museum-plaque
 * feel: bold display headline above, elegant serif body below.
 */
export const creatorDescriptionFont = Cormorant_Upright({
  subsets: ["latin"],
  weight: ["500"],
  style: ["normal"],
  display: "swap",
  variable: "--font-creator-description",
});

/** Every font variable the app shell needs, ready to drop on <html>. */
export const fontVariables = [
  displayFont.variable,
  bodyFont.variable,
  creatorTitleFont.variable,
  creatorDescriptionFont.variable,
].join(" ");
