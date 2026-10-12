// Wall materials: wall / floor-slab / six window colours (3 bays × 2 floors).
// Dark is dusk — a few windows lit warm or Wadzzo-green; light is a calm,
// architectural-model mint/stone/sage. Roof caps get a matching colour.
// `make-textures.mjs` turns MATERIALS into the SVG pattern images uploaded to
// each style in Studio (names wz-m0…wz-m3).
export const MATERIALS = {
  dark: [
    { wall: "#34463b", frame: "#24332a", win: ["#121b16", "#ffd27e", "#121b16", "#a8f5b2", "#121b16", "#ffe6ae"], roof: "#62766a" }, // concrete
    { wall: "#463a31", frame: "#30271f", win: ["#ffd98f", "#15110e", "#15110e", "#ffc96e", "#15110e", "#15110e"], roof: "#735f50" }, // brick
    { wall: "#2b3d4e", frame: "#1d2a37", win: ["#9fe0ff", "#0f1820", "#b8ffc6", "#cfefff", "#0f1820", "#9fe0ff"], roof: "#566a7c" }, // glass
    { wall: "#3d4740", frame: "#2b332d", win: ["#121815", "#ffe3a3", "#121815", "#121815", "#c8ffd2", "#121815"], roof: "#6b746d" }, // plaster
  ],
  light: [
    { wall: "#e4ebe6", frame: "#cdd7d0", win: ["#7f998d", "#95ada2", "#7f998d", "#8aa397", "#7f998d", "#95ada2"], roof: "#d5e0d8" },
    { wall: "#e6e1d8", frame: "#d3ccc0", win: ["#8c958d", "#9ba49c", "#8c958d", "#959e96", "#8c958d", "#9ba49c"], roof: "#dcd6cc" },
    { wall: "#dbe4e3", frame: "#c4d1cf", win: ["#7d9a98", "#91aeab", "#7d9a98", "#88a5a2", "#7d9a98", "#91aeab"], roof: "#d2dcdc" },
    { wall: "#eef0ea", frame: "#d6d9d1", win: ["#95a59b", "#a7b5ac", "#95a59b", "#9eaea4", "#95a59b", "#a7b5ac"], roof: "#e2e6df" },
  ],
};
