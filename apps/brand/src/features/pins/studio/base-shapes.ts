// The Shapes tool's starting points: each built-in shape as editable points.

import { regularPolygonPath, starPath } from "@wadzzo/schemas/pin-look";
import { pathToPoints, type Node } from "@wadzzo/schemas/shape-geometry";

export type Base = "circle" | "square" | "polygon" | "star" | "shield" | "teardrop";

export const BASES: { id: Base; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Square" },
  { id: "polygon", label: "Polygon" },
  { id: "star", label: "Star" },
  { id: "shield", label: "Shield" },
  { id: "teardrop", label: "Teardrop" },
];

export type BaseOptions = { sides: number; points: number; inner: number; rounded: boolean };
export const DEFAULT_BASE_OPTIONS: BaseOptions = {
  sides: 6,
  points: 5,
  inner: 0.5,
  rounded: false,
};

const n = (x: number, y: number, smooth: boolean): Node => ({ x, y, smooth });

export function baseNodes(base: Base, o: BaseOptions): Node[] {
  const corners = (path: string) =>
    (pathToPoints(path)?.points ?? []).map(([x, y]) => n(x, y, o.rounded));
  switch (base) {
    case "circle":
      return Array.from({ length: 8 }, (_, i) => {
        const t = (i / 8) * 2 * Math.PI - Math.PI / 2;
        return n(
          Math.round((50 + 46 * Math.cos(t)) * 100) / 100,
          Math.round((50 + 46 * Math.sin(t)) * 100) / 100,
          true,
        );
      });
    case "square":
      return [n(6, 6, o.rounded), n(94, 6, o.rounded), n(94, 94, o.rounded), n(6, 94, o.rounded)];
    case "polygon":
      return corners(regularPolygonPath(o.sides, 0));
    case "star":
      return corners(starPath(o.points, o.inner, 0));
    case "shield":
      return [
        n(50, 4, false),
        n(92, 17, false),
        n(92, 47, true),
        n(74, 79, true),
        n(50, 96, false),
        n(26, 79, true),
        n(8, 47, true),
        n(8, 17, false),
      ];
    case "teardrop":
      return [
        n(50, 97, false),
        n(21, 63, true),
        n(12, 38, true),
        n(26, 12, true),
        n(50, 3, true),
        n(74, 12, true),
        n(88, 38, true),
        n(79, 63, true),
      ];
  }
}
