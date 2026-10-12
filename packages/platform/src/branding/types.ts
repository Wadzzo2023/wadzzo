/**
 * Everything that makes one white-label deployment look and read like its own
 * product. Deployments differ by configuration (`PLATFORM_SLUG`), never by code:
 * adding a platform means adding one file next to `wadzzo.ts` and a theme.
 */
export interface PlatformBranding {
  /** `Platform.id` in the database. */
  readonly slug: string;
  /** What the product is called in running text: "Open in {name}". */
  readonly name: string;
  /** The formal name, for credits and calendar files. */
  readonly longName: string;
  /** The in-app currency, e.g. "Wadzzo Coins". */
  readonly coinName: string;
  /** Short form of the currency's owner, e.g. "Wadzzo balance". */
  readonly coinOwner: string;
  /** Tab title of the AR web app. */
  readonly arAppTitle: string;
  readonly portalTitle: string;
  /** `#Hashtag` added to shared posts. */
  readonly hashtag: string;
  /** Prefix for downloaded file names (`clinton-qr-….png`). */
  readonly filePrefix: string;
  /** Stand-in slug when a name has no usable characters. */
  readonly fallbackSlug: string;
  /** The big letters and the small plate of the boot / device-frame lockup. */
  readonly wordmark: { readonly letters: readonly string[]; readonly plate: string };
  /** Public paths of the platform's images (served from `/platform/...` for partners). */
  readonly assets: {
    /** Square mark used as avatar fallback, card back and favicon image. */
    readonly mark: string;
    readonly logo: string;
    /** Small loading / app icon. */
    readonly loading: string;
    /** Placeholder for a user without a picture. */
    readonly avatar: string;
    readonly favicon: string;
  };
  readonly colors: {
    /** Browser chrome (`theme-color`) of the brand portal. */
    readonly portalThemeDark: string;
    readonly portalThemeLight: string;
    /** Browser chrome (`theme-color`) of the AR app in dark and light. */
    readonly themeDark: string;
    readonly themeLight: string;
    /** Navigation route line, its casing and the nav-arrow fill. */
    readonly mapRoute: string;
    readonly mapRouteCasing: string;
    readonly mapNavAccent: string;
    /** Route colour while the directions screen is loading. */
    readonly mapLoadingRoute: string;
    /** Accent of an embedded map that sets none. */
    readonly embedAccent: string;
    /** Border and glow of a collectible card's back. */
    readonly cardBorder: string;
    readonly cardGlow: string;
    /** Completed ring on a mural pack, and its halo. */
    readonly packDone: string;
    readonly packDoneGlow: string;
  };
  readonly urls: {
    readonly arWeb: string;
    readonly brandPortal: string;
    /** Where fans land (shared links) and where default images (`/images/loading.png`, avatar) are served from. */
    readonly fanApp: string;
  };
  readonly contact: {
    readonly supportEmail: string;
    /** Where "contact support" links go (a page or a `mailto:`). */
    readonly supportUrl: string;
  };
  /** Defaults for the stellar.toml `[DOCUMENTATION]` block when no `TOML_ORG_*` env is set. */
  readonly toml: {
    readonly orgName: string;
    readonly orgUrl: string;
    readonly orgLogo?: string;
    readonly orgDescription?: string;
    readonly orgTwitter?: string;
    readonly orgEmail?: string;
    readonly principals: readonly { name: string; twitter?: string; github?: string }[];
  };
  readonly calendar: { readonly productId: string; readonly uidDomain: string };
}
