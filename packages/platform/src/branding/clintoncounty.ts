import type { PlatformBranding } from "./types";

/** Clinton County, Iowa: partner platform (web.clintoncounty-ia.gov, brand.clintoncounty-ia.gov). */
export const clintonCountyBranding: PlatformBranding = {
  slug: "clintoncounty",
  name: "Clinton, IA",
  longName: "Clinton County",
  coinName: "Clinton Coins",
  coinOwner: "Clinton",
  arAppTitle: "Clinton, IA AR — Collect the real world",
  portalTitle: "Clinton, IA Brand Portal",
  hashtag: "#ClintonCounty",
  filePrefix: "clinton",
  fallbackSlug: "clinton",
  wordmark: { letters: ["C", "L", "I", "N", "T", "O", "N"], plate: "IA" },
  assets: {
    mark: "/platform/brand/brand-mark.png",
    logo: "/platform/images/logo.png",
    loading: "/platform/images/loading.png",
    token: "/platform/brand/token-mark.png",
    avatar: "/platform/images/icons/avatar-icon.png",
    favicon: "/platform/favicon.ico",
  },
  // Grow Clinton palette: navy #27566e, gold #c6ab7c, lighter navy #326f87 on dark backgrounds.
  colors: {
    portalThemeDark: "#000000",
    portalThemeLight: "#f5f5f5",
    themeDark: "#000000",
    themeLight: "#f5f5f5",
    mapRoute: "#326f87",
    mapRouteCasing: "#173846",
    mapNavAccent: "#27566e",
    mapLoadingRoute: "#c6ab7c",
    embedAccent: "#27566e",
    cardBorder: "#27566e",
    cardGlow: "rgba(198,171,124,0.35)",
    packDone: "hsl(38 39% 63%)",
    packDoneGlow: "hsl(38 39% 63% / 0.35)",
  },
  urls: {
    arWeb: "https://clinton.wadzzo.com",
    brandPortal: "https://clintonadmin.wadzzo.com",
    fanApp: "https://web.wadzzo.com",
  },
  contact: { supportEmail: "support@wadzzo.com", supportUrl: "mailto:support@wadzzo.com" },
  toml: {
    orgName: "Clinton, IA",
    orgUrl: "https://www.clintoncounty-ia.gov/",
    principals: [],
  },
  // For now Clinton County accounts are created and signed in without confirming the email.
  auth: { requireEmailVerification: false, signInLabel: "Login" },
  calendar: { productId: "Clinton County", uidDomain: "clintoncounty-ia.gov" },
};
