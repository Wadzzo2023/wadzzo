import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { renderOutlinePng } from "../images";

describe("renderOutlinePng", () => {
  it("draws the outline black on white", async () => {
    const png = await renderOutlinePng("M20 20 L80 20 L80 80 L20 80 Z", 112);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels]!;
    expect(info.width).toBe(112);
    expect(at(56, 56)).toBeLessThan(30); // inside the square: black
    expect(at(3, 3)).toBeGreaterThan(225); // outside: white
  });

  it("refuses anything that isn't plain path data", async () => {
    await expect(renderOutlinePng('M0 0"/><script>')).rejects.toThrow(/can't be drawn/);
  });
});
