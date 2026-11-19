import { platformBranding } from "@wadzzo/platform/branding";
import {
  Bungee_Shade,
  Chakra_Petch,
  Cormorant_Upright,
  Federo,
  Quicksand,
  Sora,
} from "next/font/google";

/**
 * ── AR type system ─────────────────────────────────────────────────────────
 *
 * Two families do all the work, the way a game HUD does it:
 *
 *  · Display — carries every piece of chrome: tab labels, stat counters,
 *    distance readouts, rarity plates, buttons. (Wadzzo: Chakra Petch,
 *    angular and slightly condensed, its cut edges read as "interface".)
 *
 *  · Body — geometric, generous x-height, very legible at 13-15px on a phone
 *    in daylight. Carries prose: pin descriptions, brand bios, help text.
 *    (Wadzzo: Sora.)
 *
 * Both are variable-weight-friendly on Google Fonts and subset to latin only,
 * so the boot sequence isn't waiting on a 300kB font payload.
 */

/**
 * Each platform picks its own pair; both pairs expose the same CSS variables,
 * so nothing downstream knows which one is active.
 *
 *  · wadzzo         Chakra Petch (display) + Sora (body)
 *  · clintoncounty  Federo (display) + Quicksand (body): free stand-ins for the Grow
 *                   Clinton brand faces, Luxia and Typograph Pro. The Clinton theme
 *                   (themes/clintoncounty/ar.css) sets interface labels in Quicksand
 *                   SemiBold and keeps Federo for titles.
 */
const wadzzoDisplay = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-display",
});
const wadzzoBody = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-body",
});
const countyDisplay = Federo({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--nf-display",
});
const countyBody = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--nf-body",
});

const isCounty = platformBranding.slug === "clintoncounty";
export const displayFont = isCounty ? countyDisplay : wadzzoDisplay;
export const bodyFont = isCounty ? countyBody : wadzzoBody;

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

/**
 * Font variables for <body>. `body` reads `var(--nf-body)` (arcade.css), which only
 * resolves when the variables are on <body> itself, not on the wrapper inside it.
 * Clinton sets them here so its body text is Quicksand; Wadzzo keeps its current look.
 */
export const bodyFontVariables = isCounty ? fontVariables : "";
