import { isValidLocation } from "../../shared/locations.js";
import { pernikPlaces } from "../data/pernikPlaces.js";
import { DEFAULT_PICKUP_LOCATION } from "./locationService.js";

const PHOTON_URL = "https://photon.komoot.io/api/";
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
export const MIN_SUGGESTION_LENGTH = 3;

function normalize(value) {
  return value.normalize("NFKC").toLocaleLowerCase("bg").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function localPlaceSuggestions(query) {
  const normalized = normalize(query);
  if (normalized.length < MIN_SUGGESTION_LENGTH) return [];
  const words = normalized.split(/\s+/);
  return pernikPlaces.filter(place => [place.label, ...place.aliases].some(alias => {
    const tokens = normalize(alias).split(/\s+/);
    return words.every(word => tokens.some(token => token.startsWith(word)));
  }));
}

export function mergePlaceSuggestions(...lists) {
  const seen = new Set();
  return lists.flat().filter(place => {
    const key = place.id || `${place.lat},${place.lng},${normalize(place.label)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

export async function remotePlaceSuggestions(query, nearLocation, signal) {
  const trimmed = query.trim();
  if (normalize(trimmed).length < MIN_SUGGESTION_LENGTH) return [];
  const center = isValidLocation(nearLocation) ? nearLocation : DEFAULT_PICKUP_LOCATION;
  const key = `${normalize(trimmed)}:${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.results;

  const params = new URLSearchParams({
    q: trimmed, lat: String(center.lat), lon: String(center.lng),
    limit: "5", countrycode: "BG", lang: "default", location_bias_scale: "0.1"
  });
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(`${PHOTON_URL}?${params}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error("Place suggestions are unavailable");
  const data = await response.json();
  if (!Array.isArray(data.features)) throw new Error("Invalid place suggestions response");
  const results = data.features.map(normalizePhotonPlace).filter(Boolean);
  cache.delete(key);
  cache.set(key, { time: Date.now(), results });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
  return results;
}

function normalizePhotonPlace(feature) {
  const properties = feature.properties || {};
  const [lng, lat] = feature.geometry?.coordinates || [];
  if (feature.geometry?.type !== "Point" || properties.countrycode?.toUpperCase() !== "BG" || !isValidLocation({ lat, lng })) return null;
  const street = [properties.street, properties.housenumber].filter(Boolean).join(" ");
  const label = properties.name || street || properties.city;
  if (!label) return null;
  const detail = [...new Set([street, properties.district, properties.city || properties.county || properties.state].filter(value => value && value !== label))].join(" · ");
  return {
    id: properties.osm_id && properties.osm_type ? `osm:${properties.osm_type.toUpperCase()}:${properties.osm_id}` : undefined,
    label, detail: detail || "България", lat, lng
  };
}
