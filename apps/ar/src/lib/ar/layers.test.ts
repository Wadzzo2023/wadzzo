import { describe, expect, it, vi } from "vitest";

vi.mock("~/utils/api", () => ({ api: {} }));

import { chipLabels, DEFAULT_LAYER_VIEW, inLayer, trailInLayer, useMapLayer } from "./layers";

const chip = (id: string, name: string, brand?: string) => ({
  id,
  name,
  brand,
  icon: "Hospital",
  color: "#E5484D",
  pinCount: 1,
});

describe("map layer chips", () => {
  it("names the brand only when two brands' layers share a name", () => {
    const layers = [
      chip("a", "Hospital", "Acme"),
      chip("b", "hospital", "Zed"),
      chip("c", "School", "Acme"),
    ];
    const label = chipLabels(layers);
    expect(layers.map(label)).toEqual(["Hospital · Acme", "hospital · Zed", "School"]);
  });

  it("copes with an older server that sends no brand", () => {
    const layers = [chip("a", "Hospital"), chip("b", "Hospital")];
    expect(layers.map(chipLabels(layers))).toEqual(["Hospital", "Hospital"]);
  });

  it("shows regular pins by default, and the layers that are on", () => {
    const regular = { layer: null };
    const inA = { layer: { id: "a", name: "Hospital", icon: "Hospital", color: "#000" } };
    const inB = { layer: { id: "b", name: "School", icon: "School", color: "#000" } };
    expect(inLayer(regular, DEFAULT_LAYER_VIEW)).toBe(true);
    expect(inLayer(inA, DEFAULT_LAYER_VIEW)).toBe(false);
    const both = { regular: true, layers: ["a", "b"] };
    expect([regular, inA, inB].map((p) => inLayer(p, both))).toEqual([true, true, true]);
    const onlyA = { regular: false, layers: ["a"] };
    expect([regular, inA, inB].map((p) => inLayer(p, onlyA))).toEqual([false, true, false]);
  });
});

describe("trailInLayer", () => {
  it("shows regular trails by default, and those in layers that are on", () => {
    expect(trailInLayer({ layerId: null }, DEFAULT_LAYER_VIEW)).toBe(true);
    expect(trailInLayer({ layerId: "h1" }, DEFAULT_LAYER_VIEW)).toBe(false);
    expect(trailInLayer({ layerId: "h1" }, { regular: false, layers: ["h1"] })).toBe(true);
    expect(trailInLayer({ layerId: null }, { regular: false, layers: ["h1"] })).toBe(false);
  });

  it("counts a trail from an older server (no layerId) as regular", () => {
    expect(trailInLayer({}, DEFAULT_LAYER_VIEW)).toBe(true);
    expect(trailInLayer({}, { regular: false, layers: ["h1"] })).toBe(false);
  });
});

describe("the layer choice", () => {
  it("toggles, selects all, deselects all, reveals and forgets ended layers", () => {
    const st = useMapLayer.getState;
    st().toggleLayer("a");
    expect(st().view).toEqual({ regular: true, layers: ["a"] });
    st().toggleRegular();
    expect(st().view).toEqual({ regular: false, layers: ["a"] });
    st().setAll(true, ["a", "b"]);
    expect(st().view).toEqual({ regular: true, layers: ["a", "b"] });
    st().keepOnly(["b"]);
    expect(st().view.layers).toEqual(["b"]);
    st().setAll(false, ["a", "b"]);
    expect(st().view).toEqual({ regular: false, layers: [] });
    st().reveal("a");
    st().reveal(null);
    expect(st().view).toEqual({ regular: true, layers: ["a"] });
  });
});
