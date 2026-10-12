// Wadzzo buildings for the "Wadzzo 3D" Studio styles.
//
// Mapbox Standard draws most cities (Dhaka included) as plain extruded boxes:
// footprint + height is all the data there is, and its facade detail only
// exists for a few landmark cities. This swaps Standard's buildings for our
// own from mapbox-streets-v8: walls textured with windows + floor slabs in
// four materials (fill-extrusion-pattern, images wz-m0…3 in the style), a
// separate roof cap per material, ambient occlusion, and lit windows at dusk.
// Needs GL JS ≥ 3.13-ish / native v11.17+: older Standard ignores
// `show3dBuildings: false` and draws its boxes over ours.
//
// Run from wadzzoAR:  node --env-file=.env.development scripts/map-theme/patch-buildings.mjs
// Writes wadzzo-3d-dark.json / wadzzo-3d-light.json next to this file from the
// currently PUBLISHED styles. In Studio, per style: Images → upload
// textures/<theme>/*.svg (from make-textures.mjs), then style ⋮ → Replace with
// the JSON, check, Publish. Re-running on an already-patched style is a no-op.
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { MATERIALS } from "./materials.mjs";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;
if (!TOKEN)
  throw new Error("NEXT_PUBLIC_MAPBOX_API missing (run with --env-file=.env.development)");

const STYLES = {
  dark: "cmuwbonsf00rv01sdcun4fhdu",
  light: "cmuwc16ut00gz01sd6359b3sw",
};

// Most OSM buildings around Dhaka/Savar carry only the 3 m default height,
// which reads as flat slabs; lift those to ~2 floors so walls (and windows) show.
const MIN_HEIGHT = 7;

function buildingLayers(theme) {
  const dark = theme === "dark";
  const mats = MATERIALS[theme];
  const height = ["max", ["get", "height"], MIN_HEIGHT];
  // Grow out of the ground as you zoom in, like Standard's do.
  const grow = (v) => ["interpolate", ["linear"], ["zoom"], 14, 0, 15, v];
  const material = ["%", ["to-number", ["id"]], mats.length]; // stable per building
  const pick = (values) => [
    "match",
    material,
    ...values.slice(0, -1).flatMap((v, i) => [i, v]),
    values.at(-1),
  ];
  const common = {
    type: "fill-extrusion",
    source: "wadzzo-streets",
    "source-layer": "building",
    minzoom: 14,
    slot: "middle",
    filter: ["all", ["==", ["get", "extrude"], "true"], ["!=", ["get", "underground"], "true"]],
  };
  return [
    {
      ...common,
      id: "wadzzo-walls",
      paint: {
        "fill-extrusion-pattern": pick(mats.map((_, i) => `wz-m${i}`)),
        "fill-extrusion-height": grow(height),
        "fill-extrusion-base": grow(["get", "min_height"]),
        "fill-extrusion-vertical-gradient": false,
        "fill-extrusion-ambient-occlusion-intensity": 0.35,
        "fill-extrusion-ambient-occlusion-radius": 3,
        // Dusk: windows read as lit.
        "fill-extrusion-emissive-strength": dark ? 1 : 0,
      },
    },
    {
      // A thin cap so roofs get their own colour (patterns would tile windows onto them).
      ...common,
      id: "wadzzo-roofs",
      paint: {
        "fill-extrusion-color": pick(mats.map((m) => m.roof)),
        "fill-extrusion-base": grow(height),
        "fill-extrusion-height": grow(["+", height, 0.8]),
        "fill-extrusion-ambient-occlusion-intensity": 0.3,
        "fill-extrusion-emissive-strength": dark ? 0.35 : 0,
      },
    },
  ];
}

// Server-managed fields Studio sets itself on upload.
const DROP = ["id", "owner", "created", "modified", "visibility", "protected", "draft"];

for (const [theme, id] of Object.entries(STYLES)) {
  const res = await fetch(`https://api.mapbox.com/styles/v1/wadzzo/${id}?access_token=${TOKEN}`);
  if (!res.ok) throw new Error(`${theme}: ${res.status} ${await res.text()}`);
  const style = await res.json();
  for (const k of DROP) delete style[k];

  const basemap = style.imports?.find((i) => i.id === "basemap");
  if (!basemap) throw new Error(`${theme}: no "basemap" import — not a Standard style?`);
  // The API inlines the *latest* Standard into `data`; keeping it would pin
  // that version and break SDKs older than it (GL JS 3.12 can't parse it).
  // Import by URL only, so each SDK resolves a Standard it supports.
  delete basemap.data;
  // Our layers replace Standard's buildings; dark is dusk, not night.
  basemap.config = {
    ...basemap.config,
    show3dBuildings: false,
    ...(theme === "dark" ? { lightPreset: "dusk" } : {}),
  };
  delete basemap.config.show3dFacades;

  style.sources = {
    ...style.sources,
    "wadzzo-streets": { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" },
  };
  const ours = new Set(["wadzzo-buildings", "wadzzo-walls", "wadzzo-roofs"]);
  style.layers = [...(style.layers ?? []).filter((l) => !ours.has(l.id)), ...buildingLayers(theme)];

  const out = path.join(import.meta.dirname, `wadzzo-3d-${theme}.json`);
  await writeFile(out, JSON.stringify(style, null, 2));
  console.log(`wrote ${path.basename(out)} — ${style.name}, ${style.layers.length} layer(s)`);
}
