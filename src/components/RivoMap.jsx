import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapMock } from "./UI";

const DEFAULT_CENTER = { lat: 42.6019, lng: 23.0334 };
const DARK_MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";

export default function RivoMap({ pickup, destination, route, onDestinationSelect, onMapReady, recenterSignal, className = "" }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const pickupRef = useRef(null);
  const destinationRef = useRef(null);
  const routeRef = useRef(null);
  const onDestinationSelectRef = useRef(onDestinationSelect);
  const onMapReadyRef = useRef(onMapReady);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    onDestinationSelectRef.current = onDestinationSelect;
    onMapReadyRef.current = onMapReady;
  }, [onDestinationSelect, onMapReady]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: DARK_MAP_STYLE,
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
        customAttribution: "© OpenFreeMap © OpenStreetMap contributors"
      }), "bottom-left");

      map.on("load", () => {
        setMapReady(true);
        setMapError(false);
        onMapReadyRef.current?.(map);
      });

      map.on("click", (event) => {
        const { lng, lat } = event.lngLat;
        onDestinationSelectRef.current?.({ lat, lng });
      });

      map.on("error", () => {
        setMapError(true);
      });
    } catch (error) {
      setMapError(true);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const map = mapRef.current;
    const center = pickup || DEFAULT_CENTER;
    map.flyTo({ center: [center.lng, center.lat], zoom: 13, speed: 1.4, curve: 1.2 });
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

    if (isValidLocation(pickup) && isValidLocation(destination) && route?.geometry) {
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

  if (mapError) {
    return <MapMock />;
  }

  return <div ref={mapContainerRef} className={`map liveMap ${className}`} aria-label="Карта на маршрута" />;
}

function isValidLocation(location) {
  return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng));
}
