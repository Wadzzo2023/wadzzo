// @ts-nocheck — plain Node script, not app code.
// Wadzzo color themes for Mapbox Standard — 1024x32 cube-strip LUTs
// (x = red within each 32px square, y = green, square index = blue).
//
// Brightness-preserving recolor: every colour keeps its exact luminance
// (Mapbox's own ground/road/building/label contrast, tuned per light
// preset), but its hue/chroma move onto Wadzzo's green-tinted neutrals.
// Saturated blues (water) → Wadzzo teal, greens (parks) → Wadzzo green,
// vivid accents (POI icons) keep part of their own hue.
//
// Run from wadzzoAR:  node scripts/map-theme/make-lut.cjs
// Writes wadzzo-dark.png / wadzzo-light.png next to this file; upload each to
// its Studio style (Basemap › Color theme › Custom › Replace), then Publish.
const sharp = require(process.argv[2] ?? "sharp");
const out = process.argv[3] ?? __dirname;
const N = 32;

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function hsv([r, g, b]) {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0 };
}
const band = (h, a, b, f = 20) => clamp01(Math.min((h - (a - f)) / f, (b + f - h) / f));
/** Same hue as `c`, luminance exactly `y`. */
function atLuminance(c, y) {
  const l = lum(c);
  if (l <= 1e-6) return [y, y, y];
  let o = c.map((v) => v * (y / l));
  const over = Math.max(...o);
  if (over > 1) o = mix(o, [1, 1, 1], (over - 1) / (over - y + 1e-6)).map(clamp01); // desaturate instead of clipping
  return o;
}

const rgb = (...v) => v.map((x) => x / 255);
const THEMES = {
  // From wadzzoWebAR-public/src/theme/tokens.ts (dark).
  dark: {
    tint: rgb(28, 44, 36), // green-tinted neutral (ar-surface-3 → ar-green-deep)
    tintStrength: 0.9,
    water: rgb(6, 70, 92), // deep cyan-teal — clearly not ground
    waterBright: 0.8, // a touch darker than the land around it
    park: rgb(30, 116, 27), // ar-green-deep
    contrast: 1.12,
  },
  light: {
    tint: rgb(196, 214, 203), // ar-line → ar-bg family
    tintStrength: 0.85,
    water: rgb(120, 196, 214),
    waterBright: 0.92,
    park: rgb(170, 220, 160),
    contrast: 1.04,
  },
};

function grade(t, c) {
  const { h, s } = hsv(c);
  let y = lum(c);
  y = clamp01(0.5 + (y - 0.5) * t.contrast);
  // Neutral: Wadzzo tint at the same brightness.
  let o = mix(
    atLuminance(c, y),
    atLuminance(t.tint, y),
    t.tintStrength * (1 - Math.min(1, s * 1.2) * 0.35),
  );
  // Water: strongly saturated blues.
  const wW = band(h, 185, 230) * clamp01((s - 0.45) * 4);
  o = mix(o, atLuminance(t.water, y * t.waterBright), wW);
  // Parks / vegetation.
  const wG = band(h, 70, 165) * clamp01((s - 0.12) * 3);
  o = mix(o, atLuminance(t.park, y), wG * 0.8);
  // Vivid accents (POI icons, transit, shields): keep some identity.
  const wA = clamp01((s - 0.4) * 2.5) * (1 - wW) * (1 - wG);
  o = mix(o, c, wA * 0.55);
  return o.map((v) => Math.round(clamp01(v) * 255));
}

(async () => {
  for (const [name, t] of Object.entries(THEMES)) {
    const buf = Buffer.alloc(N * N * N * 3);
    for (let bi = 0; bi < N; bi++)
      for (let gi = 0; gi < N; gi++)
        for (let ri = 0; ri < N; ri++) {
          const o = grade(t, [ri / (N - 1), gi / (N - 1), bi / (N - 1)]);
          const i = (gi * N * N + bi * N + ri) * 3;
          buf[i] = o[0];
          buf[i + 1] = o[1];
          buf[i + 2] = o[2];
        }
    await sharp(buf, { raw: { width: N * N, height: N, channels: 3 } })
      .png()
      .toFile(`${out}/wadzzo-${name}.png`);
    console.log("wrote", `wadzzo-${name}.png`);
  }
})();
