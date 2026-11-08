import { describe, expect, it } from "vitest";

import {
  BUILTIN_SHAPES,
  BUILTIN_SHAPE_IDS,
  checkShapePath,
  columnsToLook,
  lookToColumns,
  resolvePinLook,
  starPath,
} from "../pin-look";

describe("checkShapePath", () => {
  it("accepts every built-in shape", () => {
    for (const id of BUILTIN_SHAPE_IDS)
      expect(checkShapePath(BUILTIN_SHAPES[id].path).ok).toBe(true);
  });

  it("accepts generated stars of any point count", () => {
    for (const n of [3, 5, 8, 12]) expect(checkShapePath(starPath(n, 0.4, 0.3)).ok).toBe(true);
  });

  it("accepts several closed outlines", () => {
    expect(checkShapePath("M10 10 L90 10 L50 90 Z M40 30 L60 30 L50 50 Z").ok).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["M10 10 L90 10 L50 90", "not closed"],
    ["L10 10 L90 10 Z", "no move first"],
    ["m10 10 l80 0 l-40 80 z", "relative commands"],
    ["M10 10 L200 10 L50 90 Z", "outside the box"],
    ["M10 10 L90 10 L50 Z", "wrong number of values"],
    ['M10 10 L90 10 L50 90 Z"/><script>alert(1)</script>', "markup"],
    ["M10 10 L90 10 L50 90 Z javascript:x", "letters"],
    ["M10 10 L90 10 M20 20 L30 30 Z", "an unclosed outline before the next"],
    ["M10 10 A0 0 0 0 1 90 90 Z", "a zero-radius arc"],
  ])("rejects %j (%s)", (d) => {
    expect(checkShapePath(d).ok).toBe(false);
  });

  it("rejects a path that is far too detailed", () => {
    const many = Array.from({ length: 1500 }, (_, i) => `L${(i % 90) + 5} ${(i % 80) + 10}`).join(
      " ",
    );
    expect(checkShapePath(`M5 5 ${many} Z`).ok).toBe(false);
  });

  it("tidies numbers and separators", () => {
    const r = checkShapePath("M 10,10   L90.123456,10 L50 90Z");
    expect(r).toEqual({ ok: true, path: "M10 10 L90.12 10 L50 90 Z" });
  });
});

describe("pin look columns", () => {
  it("stores a built-in shape and a brand shape in different columns", () => {
    expect(lookToColumns({ shape: "star" }, false)).toMatchObject({
      markerShape: "star",
      pinShapeId: null,
    });
    expect(lookToColumns({ shape: "cl_shape1" }, true)).toMatchObject({
      markerShape: null,
      pinShapeId: "cl_shape1",
    });
  });

  it("drops an unknown built-in", () => {
    expect(lookToColumns({ shape: "dragon" }, false).markerShape).toBeNull();
  });

  it("defaults to the brand logo with the badge on", () => {
    expect(lookToColumns(undefined, false)).toMatchObject({
      markerFill: "BRAND",
      markerAutoBadge: true,
    });
  });

  it("reads garbage back as the defaults", () => {
    expect(
      columnsToLook({
        markerShape: "??",
        markerFill: "X",
        markerColor: "red",
        markerImageFit: "no",
      }),
    ).toEqual({ shape: "circle", fill: "BRAND", color: null, imageFit: null, autoBadge: true });
  });
});

describe("resolvePinLook", () => {
  const base = {
    markerShape: "hexagon",
    pinShapeId: null,
    markerFill: "BRAND",
    markerColor: null,
    markerImageFit: null,
    markerAutoBadge: true,
  };

  it("falls back from pin image to brand logo to colour", () => {
    const pin = { ...base, markerFill: "PIN" };
    expect(
      resolvePinLook(pin, { pinImage: "p.png", brandImage: "b.png", autoCollect: false }).imageUrl,
    ).toBe("p.png");
    expect(
      resolvePinLook(pin, { pinImage: null, brandImage: "b.png", autoCollect: false }).imageUrl,
    ).toBe("b.png");
    expect(
      resolvePinLook(pin, { pinImage: null, brandImage: null, autoCollect: false }).imageUrl,
    ).toBeNull();
    expect(
      resolvePinLook({ ...base, markerFill: "NONE" }, { brandImage: "b.png", autoCollect: false })
        .imageUrl,
    ).toBeNull();
  });

  it("uses a valid brand shape, else the built-in, else the circle", () => {
    const custom = { path: "M10 10 L90 10 L50 90 Z", anchor: "bottom" };
    expect(resolvePinLook(base, { customShape: custom, autoCollect: false })).toMatchObject({
      path: "M10 10 L90 10 L50 90 Z",
      anchor: "bottom",
    });
    expect(
      resolvePinLook(base, {
        customShape: { path: "<svg/>", anchor: "center" },
        autoCollect: false,
      }).path,
    ).toBe(BUILTIN_SHAPES.hexagon.path);
    expect(resolvePinLook({ ...base, markerShape: null }, { autoCollect: false }).path).toBe(
      BUILTIN_SHAPES.circle.path,
    );
  });

  it("shows the badge only on auto-collect pins that keep it on", () => {
    expect(resolvePinLook(base, { autoCollect: true }).autoBadge).toBe(true);
    expect(resolvePinLook(base, { autoCollect: false }).autoBadge).toBe(false);
    expect(
      resolvePinLook({ ...base, markerAutoBadge: false }, { autoCollect: true }).autoBadge,
    ).toBe(false);
  });

  it("works with nothing stored at all (pins made before looks existed)", () => {
    expect(resolvePinLook(null, { brandImage: "b.png", autoCollect: true })).toEqual({
      path: BUILTIN_SHAPES.circle.path,
      anchor: "center",
      color: null,
      imageUrl: "b.png",
      imageFit: null,
      autoBadge: true,
    });
  });
});
