/**
 * ── Shared theme ───────────────────────────────────────────────────────────
 *
 * One theme choice for every Wadzzo site in a browser (AR, marketplace, brand portal, and the
 * partner platforms under the same domain), the way the login is shared: a cookie on the parent
 * domain (`.wadzzo.com`), which every subdomain reads. Each app still keeps its own copy in
 * localStorage, where its theme code reads it; this cookie is what keeps those copies in step.
 *
 * - On load, an inline script copies the cookie into the app's own key before its theme code
 *   runs (`sharedThemeSeedScript`), so the first paint is already right.
 * - On change, the app writes the cookie (`writeSharedTheme`).
 * - When a tab comes back into view it re-reads the cookie (`onTabReturn`), so a site left open
 *   picks up a change made on another one. Cookies fire no change events across sites, and
 *   storage events and BroadcastChannel are per-origin, hence the re-check.
 *
 * Not httpOnly on purpose: page code reads and writes it. It holds nothing private.
 */

export type SharedTheme = "light" | "dark" | "contrast" | "system";

export const SHARED_THEME_COOKIE = "wadzzo-theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function isSharedTheme(value: unknown): value is SharedTheme {
  return value === "light" || value === "dark" || value === "contrast" || value === "system";
}

/** The parent domain to share across (`brand.wadzzo.com` → `.wadzzo.com`); none for localhost or an IP. */
function parentDomain(host: string): string | null {
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return null;
  const parts = host.split(".");
  return parts.length < 2 ? null : `.${parts.slice(-2).join(".")}`;
}

export function readSharedTheme(): SharedTheme | null {
  if (typeof document === "undefined") return null;
  const match = new RegExp(`(?:^|;\\s*)${SHARED_THEME_COOKIE}=([^;]*)`).exec(document.cookie);
  const value = match ? decodeURIComponent(match[1]!) : null;
  return isSharedTheme(value) ? value : null;
}

export function writeSharedTheme(theme: SharedTheme) {
  if (typeof document === "undefined" || readSharedTheme() === theme) return;
  const base = `${SHARED_THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax${
    location.protocol === "https:" ? "; secure" : ""
  }`;
  const domain = parentDomain(location.hostname);
  if (domain) {
    document.cookie = `${base}; domain=${domain}`;
    // A browser refuses a public-suffix domain (e.g. `.vercel.app` on previews): fall back to
    // this host only.
    if (readSharedTheme() === theme) return;
  }
  // localhost: cookies ignore the port, so the apps on :3000/:3001/:3002 still share it.
  document.cookie = base;
}

/** Calls `cb` when the tab becomes visible or the window regains focus. Returns the unsubscribe. */
export function onTabReturn(cb: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", cb);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", cb);
  };
}

/**
 * Source of an inline `<head>` script that copies the shared cookie into `localStorage[storageKey]`
 * before the app's theme code reads it. `rename` maps a shared value to the app's own word for it
 * (AR calls "system" "auto").
 */
export function sharedThemeSeedScript(
  storageKey: string,
  rename: Partial<Record<SharedTheme, string>> = {},
) {
  return `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${SHARED_THEME_COOKIE}=(light|dark|contrast|system)(?:;|$)/);if(m){var r=${JSON.stringify(
    rename,
  )};localStorage.setItem(${JSON.stringify(storageKey)},r[m[1]]||m[1]);}}catch(e){}})();`;
}
