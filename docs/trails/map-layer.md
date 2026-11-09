# Trails: map layer

[← Map Trails](./README.md)

A trail is drawn in **two parts**, using the two ways the maps already draw things:

| How                                              | Used today for                                    | Used for trails                                                    |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| Mapbox `<Source>` + `<Layer>` (drawn by the GPU) | `HotspotLayer`: areas and borders                 | **Trail lines**: fast and sharp at any zoom, even with many trails |
| `<Marker>` (a React element on the map)          | `PinLayer` → `PinMarker`: shaped pins with images | **Stops**: the existing pin markers with a number badge            |

## Layer stack (top is drawn on top)

```
  UI overlays (toolbar, panel, cards)
  Pin markers + ①②③ badges       HTML <Marker> (PinLayer)
  trail-hit                       invisible 18 px line, for clicks
  trail-arrows                    › direction (ordered trails)
  trail-line                      colour · width · dashes
  trail-casing                    white outline under the line
  hotspot-fill / hotspot-line
  Mapbox base map
```

Markers always sit above the map canvas, so pins stay on top of lines. The trail source uses `beforeId` to sit above the hotspot layers.

## `TrailLayer` (built the same way as `HotspotLayer`)

`apps/brand/src/components/map-kit/trail-layer.tsx`:

```tsx
export function TrailLayer({ trails, selectedId, onSelect }: Props) {
  const { current: map } = useMap();
  // One shared function (in @wadzzo/geo), so brand, AR and mobile draw identical lines.
  const data = useMemo(() => trailsToFeatures(trails), [trails]);

  useEffect(() => {
    if (!map || !onSelect) return;
    const click = (e: mapboxgl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onSelect(id);
    };
    map.on("click", "trail-hit", click); // + mouseenter / mouseleave for the cursor
    return () => void map.off("click", "trail-hit", click);
  }, [map, onSelect]);

  const selected = selectedId ?? "";
  return (
    <Source id="trails" type="geojson" data={data}>
      <Layer
        id="trail-casing"
        type="line"
        layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{ "line-color": "#fff", "line-width": 7 }}
      />
      <Layer
        id="trail-line"
        type="line"
        layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{
          "line-color": ["get", "color"],
          "line-width": ["case", ["==", ["get", "id"], selected], 5, 3.5],
          "line-opacity": selectedId ? ["case", ["==", ["get", "id"], selected], 1, 0.35] : 0.9,
          "line-dasharray": ["case", ["get", "draft"], ["literal", [2, 1.5]], ["literal", [1, 0]]],
        }}
      />
      <Layer
        id="trail-arrows"
        type="symbol"
        filter={["get", "ordered"]}
        layout={{ "symbol-placement": "line", "symbol-spacing": 80, "icon-image": "trail-arrow" }}
      />
      <Layer id="trail-hit" type="line" paint={{ "line-width": 18, "line-opacity": 0 }} />
    </Source>
  );
}
```

- **Styling uses feature data, not code.** Each trail is a GeoJSON feature with `id, color, draft, ordered, done`, and style rules read those properties. Changing the selection doesn't rebuild the data.
- **Click conflicts:** `map-view.tsx` already checks `hotspot-fill` before a click drops a new pin. Add `trail-hit` to that check.

## Stops

- `PinMarker` gets an optional **`badge`** prop that draws ①②③ in the corner of the pin shape, like the existing ⚡ badge.
- `PinLayer` gets **`badges`** (pin id → number) and **`pinned`** (ids never clustered). A selected trail's stops are never grouped into a cluster, so the line never leads to a stop that isn't drawn.

```tsx
<PinLayer
  pins={myPins}
  onSelect={selectPin}
  badges={stopNumbers} // Map<pinId, 1 | 2 | 3 …>
  pinned={selectedStopIds}
/>
```

## Zoom

| Zoom  | Shows                               |
| ----- | ----------------------------------- |
| < 10  | Only a start flag per trail         |
| 10–14 | Lines + small numbered dots         |
| ≥ 14  | Lines + full pin shapes with badges |

## Trail mode: the draft source

While a trail is being edited, its unsaved line is drawn from a separate `trail-draft` source, fed by `use-trail-editor`'s state. Every edit updates its `data` prop and Mapbox redraws. Bend points are `<Marker draggable>`, as `DrawTool` already does for hotspot corners. The New stop's marker is previewed the same way, in its chosen shape.

## From the database to the screen

```mermaid
flowchart LR
  A[(Trail.path<br/>saved GeoJSON)] --> B[trail.listInView<br/>by map bounds]
  B --> C[trailsToFeatures<br/>@wadzzo/geo]
  C --> D[TrailLayer<br/>web: react-map-gl]
  C --> E[ShapeSource + LineLayer<br/>mobile: @rnmapbox/maps]
```

Loading follows the map's existing `onMoveEnd → refreshInView` cycle.

## Where it plugs in

```tsx
// map-view.tsx and admin/maps-page.tsx: the same additions
<BaseMap …>
  {hotspots.data && <HotspotLayer … />}
  {showTrails && <TrailLayer trails={trails.data} selectedId={trailId} onSelect={setTrailId} />}
  {!drawing && <PinLayer … badges={stopNumbers} pinned={selectedStopIds} />}
  {trailMode && <TrailTool editor={editor} />}
</BaseMap>
```

| App           | Line                                                                         | Stops                                                                               |
| ------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Brand / admin | `TrailLayer`                                                                 | `PinMarker` + badge                                                                 |
| AR web        | Same `<Source>/<Layer>`                                                      | Its `PinMarker` + badge; finished sections solid, the rest dashed (`done` property) |
| Mobile        | `<ShapeSource>` + `<LineLayer>` + `<SymbolLayer>` with the same style values | `PinGlyph` + badge                                                                  |

Shared style values (colours, widths, dash patterns) live in one constants file, so a trail looks the same in every app.
