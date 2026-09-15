import { Head, Html, Main, NextScript } from "next/document";

/**
 * Applies the stored theme preference before the page paints.
 *
 * Has to be a literal string, not an import from `lib/ar/theme.ts` — this
 * runs from a raw `<script>` tag, synchronously, before any bundled module
 * (that one included) has loaded. It's read once by the browser and never
 * touched again at runtime, so duplicating `THEME_STORAGE_KEY` and the
 * "auto resolves against matchMedia" logic here is the whole cost; see the
 * doc comment on that file for why there's no way around the duplication.
 *
 * `class="dark"` is already server-rendered on `<html>` below — the only
 * thing this ever needs to do is remove it once, if the resolved theme turns
 * out to be light. Never adds it: dark is already the starting state.
 */
const themeBootScript = `
(function () {
  try {
    var v = localStorage.getItem("wadzzo-ar-theme");
    var pref = v === "light" || v === "dark" ? v : "auto";
    var light =
      pref === "light" ||
      (pref === "auto" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches);
    if (light) {
      document.documentElement.classList.remove("dark");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#f5f9f7");
    }
  } catch (e) {}
})();
`;

export default function Document() {
  return (
    // `dark` is the server-rendered default — the no-JS-safe fallback, and
    // the starting state the boot script below corrects out of if needed.
    // See the big doc comment at the top of arcade.css for the full design.
    <Html lang="en" className="dark">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Browsers that see this prefer it over the plain `/favicon.ico`
            Next.js still serves automatically from `public/` for anything
            that doesn't. */}
        <link rel="icon" href="/brand/wadzzo-mark.png" type="image/png" />

        {/* Matches --ar-void's dark value, so the browser chrome and any
            overscroll gutter are the same color the app starts on — no flash
            on first paint. The boot script below updates this to the light
            value too, in the same synchronous pass, if it removes `dark`. */}
        <meta name="theme-color" content="#06100a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />

        {/* Runs before body paints — see the comment on `themeBootScript`. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts, react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </Head>
      <body className="bg-ar-void">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
