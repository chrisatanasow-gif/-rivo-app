import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { isValidLocation } from "../../shared/locations.js";
import { createRivoMapStyle } from "./mapStyle.js";
import "./RivoMap.css";

const DEFAULT_CENTER = { lat: 42.6019, lng: 23.0334 };
maplibregl.setWorkerUrl(mapWorkerUrl);

export default function RivoMap({ pickup, destination, route, driverProgress, driverLocation, driverFocusSignal = 0, frameProgress, onDestinationSelect, onMapReady, recenterSignal, className = "" }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const pickupRef = useRef(null);
  const destinationRef = useRef(null);
  const driverRef = useRef(null);
  const onDestinationSelectRef = useRef(onDestinationSelect);
  const onMapReadyRef = useRef(onMapReady);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const hasLiveDriver = isValidLocation(driverLocation);

  useEffect(() => {
    onDestinationSelectRef.current = onDestinationSelect;
    onMapReadyRef.current = onMapReady;
  }, [onDestinationSelect, onMapReady]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let loadingTimeout;
    let resizeObserver;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: createRivoMapStyle(),
        center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
        zoom: 12,
        attributionControl: false,
        pitchWithRotate: false,
        preserveDrawingBuffer: true
      });

      mapRef.current = map;

      map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      resizeObserver = new ResizeObserver(() => { if (mapRef.current === map) map.resize(); });
      resizeObserver.observe(mapContainerRef.current);

      let styleReady = false;
      const failMap = () => {
        if (styleReady) return;
        window.clearTimeout(loadingTimeout);
        setMapLoading(false);
        setMapError(true);
        setMapReady(false);
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

      map.on("error", event => {
        if (!styleReady) console.warn("RIVO map could not load", event.error?.message);
        if (event.sourceId === "rivo-basemap") failMap();
      });
      loadingTimeout = window.setTimeout(failMap, 12000);
    } catch (error) {
      console.warn("RIVO map could not start", error.message);
      window.clearTimeout(loadingTimeout);
      resizeObserver?.disconnect();
      setMapLoading(false);
      setMapError(true);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    }

    return () => {
      window.clearTimeout(loadingTimeout);
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapAttempt]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;
    if ((recenterSignal || !isValidLocation(destination)) && isValidLocation(pickup)) {
      map.flyTo({ center: [pickup.lng, pickup.lat], zoom: 14, speed: 1.4, curve: 1.2 });
    } else if (!isValidLocation(pickup) && isValidLocation(destination)) {
      map.flyTo({ center: [destination.lng, destination.lat], zoom: 14, speed: 1.4, curve: 1.2 });
    }
  }, [pickup, destination, mapReady, recenterSignal]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (pickupRef.current) pickupRef.current.remove();
    if (destinationRef.current) destinationRef.current.remove();

    if (isValidLocation(pickup)) {
      pickupRef.current = new maplibregl.Marker({ element: locationMarker("pickup", "Място за взимане"), anchor: "center" })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(map);
    }

    if (isValidLocation(destination)) {
      destinationRef.current = new maplibregl.Marker({ element: locationMarker("destination", "Дестинация"), anchor: "center" })
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
          id: "rivo-route-halo", type: "line", source: "rivo-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffd400", "line-width": 12, "line-opacity": .12, "line-blur": 3 }
        }, "rivo-road-labels");
        map.addLayer({
          id: "rivo-route-layer",
          type: "line",
          source: "rivo-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffd400", "line-width": 5, "line-opacity": 1 }
        }, "rivo-road-labels");
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
    updateDriverMarker(map, driverRef, route?.geometry?.coordinates, driverProgress, driverLocation);
  }, [route, mapReady, driverProgress, driverLocation]);

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
    if (isValidLocation(driverLocation)) bounds.extend([driverLocation.lng, driverLocation.lat]);

    map.fitBounds(bounds, {
      padding: { top: 42, right: 34, bottom: 74, left: 34 },
      maxZoom: 14,
      duration: 650,
      essential: true
    });
  }, [route, mapReady, frameProgress, driverProgress]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !hasLiveDriver) return;
    if (driverFocusSignal) map.flyTo({ center: [driverLocation.lng, driverLocation.lat], zoom: 14, duration: 650 });
    else {
      const bounds = new maplibregl.LngLatBounds();
      for (const point of [pickup, destination, driverLocation]) if (isValidLocation(point)) bounds.extend([point.lng, point.lat]);
      for (const point of route?.geometry?.coordinates || []) bounds.extend(point);
      map.fitBounds(bounds, { padding: { top: 42, right: 34, bottom: 74, left: 34 }, maxZoom: 14, duration: 650 });
    }
    // Frame the first received position or an explicit focus action, without
    // taking control of the map on every GPS sample.
  }, [mapReady, hasLiveDriver, driverFocusSignal]);

  useEffect(() => () => {
    if (driverRef.current) driverRef.current.remove();
  }, []);

  if (mapError) {
    return <div className={`map mapUnavailable ${className}`} role="status">
      <span className="mapUnavailableMark" aria-hidden="true">R</span>
      <b>Картата временно не е налична</b>
      <small>Можеш да избереш адрес от търсенето.</small>
      <button type="button" onClick={() => { setMapError(false); setMapLoading(true); setMapReady(false); setMapAttempt(value => value + 1); }}>ЗАРЕДИ ОТНОВО</button>
    </div>;
  }

  return <div ref={mapContainerRef} className={`map liveMap ${className}`} aria-label="Карта на маршрута">
    {mapLoading && <div className="mapLoadingState" role="status">Зареждаме картата…</div>}
  </div>;
}

function locationMarker(kind, label) {
  const element = document.createElement("div");
  element.className = `rivoLocationMarker rivoLocationMarker--${kind}`;
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", label);
  return element;
}

function updateDriverMarker(map, markerRef, coordinates, progress, livePosition) {
  const live = isValidLocation(livePosition);
  if (!live && (!Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(progress))) {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    return;
  }

  const position = live ? [livePosition.lng, livePosition.lat] : getRoutePosition(coordinates, clamp(progress, 0, 1));
  if (!markerRef.current) {
    const element = document.createElement("div");
    element.className = "rivoDriverMarker";
    element.setAttribute("aria-label", "RIVO шофьор");
    element.textContent = "R";
    markerRef.current = new maplibregl.Marker({ element, anchor: "center" }).setLngLat(position).addTo(map);
  } else {
    markerRef.current.setLngLat(position);
  }
  const element = markerRef.current.getElement();
  element.classList.toggle("isStale", Boolean(livePosition?.stale));
  if (live) {
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", livePosition.stale ? "Последна известна позиция на шофьора" : "GPS позиция на шофьора");
    element.dataset.latitude = String(livePosition.lat);
    element.dataset.longitude = String(livePosition.lng);
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
