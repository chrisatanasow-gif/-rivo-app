import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapMock } from "./UI";

const DEFAULT_CENTER = { lat: 42.6019, lng: 23.0334 };
const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
};

export default function RivoMap({ pickup, destination, route, driverProgress, frameProgress, onDestinationSelect, onMapReady, recenterSignal, className = "" }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const pickupRef = useRef(null);
  const destinationRef = useRef(null);
  const driverRef = useRef(null);
  const routeRef = useRef(null);
  const onDestinationSelectRef = useRef(onDestinationSelect);
  const onMapReadyRef = useRef(onMapReady);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    onDestinationSelectRef.current = onDestinationSelect;
    onMapReadyRef.current = onMapReady;
  }, [onDestinationSelect, onMapReady]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let loadingTimeout;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: OSM_RASTER_STYLE,
        center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
        zoom: 12,
        attributionControl: false,
        pitchWithRotate: false,
        preserveDrawingBuffer: true
      });

      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "© OpenStreetMap contributors"
      }), "bottom-left");

      let styleReady = false;
      const failMap = () => {
        if (styleReady) return;
        window.clearTimeout(loadingTimeout);
        setMapLoading(false);
        setMapError(true);
        if (mapRef.current === map) {
          map.remove();
          mapRef.current = null;
        }
      };

      map.on("load", () => {
        styleReady = true;
        window.clearTimeout(loadingTimeout);
        setMapReady(true);
        setMapLoading(false);
        setMapError(false);
        onMapReadyRef.current?.(map);
      });

      map.on("click", (event) => {
        const { lng, lat } = event.lngLat;
        onDestinationSelectRef.current?.({ lat, lng });
      });

      map.on("error", failMap);
      loadingTimeout = window.setTimeout(failMap, 7000);
    } catch (error) {
      window.clearTimeout(loadingTimeout);
      setMapLoading(false);
      setMapError(true);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    }

    return () => {
      window.clearTimeout(loadingTimeout);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;
    if (recenterSignal && isValidLocation(pickup)) {
      map.flyTo({ center: [pickup.lng, pickup.lat], zoom: 14, speed: 1.4, curve: 1.2 });
    }
  }, [pickup, mapReady, recenterSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (pickupRef.current) pickupRef.current.remove();
    if (destinationRef.current) destinationRef.current.remove();
    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }

    if (isValidLocation(pickup)) {
      pickupRef.current = new maplibregl.Marker({ color: "#ffd400" })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(map);
    }

    if (isValidLocation(destination)) {
      destinationRef.current = new maplibregl.Marker({ color: "#f97316" })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
    }

    if (route?.geometry) {
      const routeGeometry = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: route.geometry.coordinates
          }
        }]
      };

      if (!map.getSource("rivo-route")) {
        map.addSource("rivo-route", { type: "geojson", data: routeGeometry });
        map.addLayer({
          id: "rivo-route-layer",
          type: "line",
          source: "rivo-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffd400", "line-width": 4, "line-opacity": 0.9 }
        });
      } else {
        map.getSource("rivo-route").setData(routeGeometry);
      }
    } else if (map.getSource("rivo-route")) {
      map.getSource("rivo-route").setData({ type: "FeatureCollection", features: [] });
    }

  }, [pickup, destination, route, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    updateDriverMarker(map, driverRef, route?.geometry?.coordinates, driverProgress);
  }, [route, mapReady, driverProgress]);

  useEffect(() => {
    const map = mapRef.current;
    const coordinates = route?.geometry?.coordinates;
    if (!map || !mapReady || !Array.isArray(coordinates) || coordinates.length < 2) return;

    const progress = Number.isFinite(driverProgress) ? clamp(driverProgress, 0, 1) : null;
    const progressIndex = progress === null ? 0 : Math.floor(progress * (coordinates.length - 1));
    const startIndex = progress !== null && frameProgress === "remaining"
      ? Math.min(coordinates.length - 2, progressIndex)
      : 0;
    const endIndex = progress !== null && frameProgress === "to-pickup"
      ? Math.max(1, Math.min(coordinates.length - 1, progressIndex))
      : coordinates.length - 1;
    const visibleCoordinates = coordinates.slice(startIndex, endIndex + 1);
    const bounds = new maplibregl.LngLatBounds();
    visibleCoordinates.forEach(coordinate => bounds.extend(coordinate));
    if (progress !== null) bounds.extend(coordinates[Math.round(progress * (coordinates.length - 1))]);

    map.fitBounds(bounds, {
      padding: { top: 42, right: 34, bottom: 74, left: 34 },
      maxZoom: 14,
      duration: 650,
      essential: true
    });
  }, [route, mapReady, frameProgress, driverProgress]);

  useEffect(() => () => {
    if (driverRef.current) driverRef.current.remove();
  }, []);

  if (mapError) {
    return <MapMock />;
  }

  return <div ref={mapContainerRef} className={`map liveMap ${className}`} aria-label="Карта на маршрута">
    {mapLoading && <div className="mapLoadingState" role="status">Зареждаме картата…</div>}
  </div>;
}

function updateDriverMarker(map, markerRef, coordinates, progress) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(progress)) {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    return;
  }

  const position = getRoutePosition(coordinates, clamp(progress, 0, 1));
  if (!markerRef.current) {
    const element = document.createElement("div");
    element.className = "rivoDriverMarker";
    element.setAttribute("aria-label", "RIVO шофьор");
    element.textContent = "R";
    markerRef.current = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(position).addTo(map);
  } else {
    markerRef.current.setLngLat(position);
  }
}

function getRoutePosition(coordinates, progress) {
  const scaledIndex = progress * (coordinates.length - 1);
  const index = Math.min(coordinates.length - 2, Math.floor(scaledIndex));
  const fraction = scaledIndex - index;
  return [
    coordinates[index][0] + (coordinates[index + 1][0] - coordinates[index][0]) * fraction,
    coordinates[index][1] + (coordinates[index + 1][1] - coordinates[index][1]) * fraction
  ];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isValidLocation(location) {
  return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng));
}
