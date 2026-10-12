// Window/floor wall textures for the Wadzzo building layers, as SVG for
// Studio's image upload (Studio → style → Images). One tile = 3 bays × 2
// floors, 42×24 px. Writes textures/{dark,light}/wz-m0…wz-m3.svg.
//
// Run from wadzzoAR:  node scripts/map-theme/make-textures.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { MATERIALS } from "./materials.mjs";

const W = 42;
const H = 24;

function svg({ wall, frame, win }) {
  const bw = W / 3,
    fh = H / 2,
    ww = Math.round(bw * 0.62),
    wh = Math.round(fh * 0.58);
  const rects = [
    `<rect width="${W}" height="${H}" fill="${wall}"/>`,
    `<rect y="${fh - 1}" width="${W}" height="1" fill="${frame}"/>`,
    `<rect y="${H - 1}" width="${W}" height="1" fill="${frame}"/>`,
  ];
  for (let r = 0; r < 2; r++)
    for (let b = 0; b < 3; b++)
      rects.push(
        `<rect x="${Math.round(b * bw + (bw - ww) / 2)}" y="${Math.round(r * fh + fh * 0.2)}" width="${ww}" height="${wh}" fill="${win[(r * 3 + b) % win.length]}"/>`,
      );
  // Keep it 42×24: Studio rasterizes it @2x (84×48, pixelRatio 2), which
  // patterns render at 42×24 — two ~3.5 m floors per tile.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${rects.join("")}</svg>\n`;
}

for (const [theme, mats] of Object.entries(MATERIALS)) {
  const dir = path.join(import.meta.dirname, "textures", theme);
  await mkdir(dir, { recursive: true });
  for (const [i, m] of mats.entries()) await writeFile(path.join(dir, `wz-m${i}.svg`), svg(m));
  console.log(`wrote textures/${theme}/wz-m0…${mats.length - 1}.svg`);
}
