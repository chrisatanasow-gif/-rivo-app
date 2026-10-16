const roadWidth = ["interpolate", ["linear"], ["zoom"], 8, 1, 12, 2.5, 16, 8, 19, 22];
const label = ["coalesce", ["get", "name:bg"], ["get", "name"], ["get", "name:latin"], ""];

// OpenStreetMap geography, rendered in RIVO's dark palette through CARTO's public tiles.
export function createRivoMapStyle() {
  return {
    version: 8,
    name: "RIVO Dark",
    glyphs: "https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
    sources: {
      "rivo-basemap": {
        type: "vector",
        url: "https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json",
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
      }
    },
    layers: [
      { id: "rivo-background", type: "background", paint: { "background-color": "#090a0d" } },
      { id: "rivo-landuse", type: "fill", source: "rivo-basemap", "source-layer": "landuse", paint: { "fill-color": "#111318", "fill-opacity": .5 } },
      { id: "rivo-parks", type: "fill", source: "rivo-basemap", "source-layer": "park", paint: { "fill-color": "#111a18", "fill-opacity": .65 } },
      { id: "rivo-water", type: "fill", source: "rivo-basemap", "source-layer": "water", paint: { "fill-color": "#101a25" } },
      { id: "rivo-buildings", type: "fill", source: "rivo-basemap", "source-layer": "building", minzoom: 15, paint: { "fill-color": "#191c23", "fill-opacity": .7 } },
      {
        id: "rivo-road-casing", type: "line", source: "rivo-basemap", "source-layer": "transportation",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#11141b", "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 12, 4.5, 16, 10, 19, 24] }
      },
      {
        id: "rivo-roads", type: "line", source: "rivo-basemap", "source-layer": "transportation",
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["match", ["get", "class"], ["motorway", "trunk", "primary"], "#303540", ["secondary", "tertiary"], "#262b35", "#1d222b"],
          "line-width": roadWidth
        }
      },
      {
        id: "rivo-road-labels", type: "symbol", source: "rivo-basemap", "source-layer": "transportation_name", minzoom: 14,
        layout: { "symbol-placement": "line", "symbol-spacing": 240, "text-field": label, "text-font": ["Open Sans Regular"], "text-size": 11 },
        paint: { "text-color": "#8c929f", "text-halo-color": "#090a0d", "text-halo-width": 2 }
      },
      {
        id: "rivo-place-labels", type: "symbol", source: "rivo-basemap", "source-layer": "place", minzoom: 5,
        layout: { "text-field": label, "text-font": ["Open Sans Semibold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 14, 14, 18, 16], "text-max-width": 9, "text-padding": 18 },
        paint: { "text-color": "#838a98", "text-halo-color": "#090a0d", "text-halo-width": 2 }
      }
    ]
  };
}
