import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { LAYER_ICONS } from "@wadzzo/schemas/layer";
import { LAYER_ICON_COMPONENTS } from "@wadzzo/ui/patterns/layer-icon";

/**
 * A layer's icon is a name a brand picks from LAYER_ICONS; the web (packages/ui) and the native
 * app (apps/mobile) each map it to a lucide component. A name missing from either draws a
 * fallback pin there, so the three lists must match.
 */
describe("map layer icons", () => {
  it("the web draws every icon a brand can pick", () => {
    expect(Object.keys(LAYER_ICON_COMPONENTS).sort()).toEqual([...LAYER_ICONS].sort());
  });

  it("the mobile app draws every icon a brand can pick", () => {
    const src = readFileSync(
      path.resolve(import.meta.dirname, "../../../../../../mobile/src/lib/ar/layers.ts"),
      "utf8",
    );
    const table = /const ICONS: Record<string, LucideIcon> = \{([^}]*)\}/.exec(src)?.[1] ?? "";
    const names = table
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(names.sort()).toEqual([...LAYER_ICONS].sort());
  });
});
