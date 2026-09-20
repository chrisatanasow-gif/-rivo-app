const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

export async function searchAddresses(query, nearLocation) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const params = new URLSearchParams({
    q: trimmedQuery,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "bg",
    limit: "5",
    dedupe: "1",
    "accept-language": "bg"
  });

  addLocationBias(params, nearLocation);
  const response = await fetch(`${NOMINATIM_URL}/search?${params}`);
  if (!response.ok) throw new Error("Nominatim search failed");

  const results = await response.json();
  return results.map(normalizeResult).filter(Boolean);
}

export async function reverseGeocode(location) {
  if (!isValidLocation(location)) return null;

  const params = new URLSearchParams({
    lat: String(location.lat),
    lon: String(location.lng),
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
    "accept-language": "bg"
  });
  const response = await fetch(`${NOMINATIM_URL}/reverse?${params}`);
  if (!response.ok) throw new Error("Nominatim reverse geocoding failed");

  return normalizeResult(await response.json());
}

function normalizeResult(result) {
  if (!result || !Number.isFinite(Number(result.lat)) || !Number.isFinite(Number(result.lon))) {
    return null;
  }

  const address = result.address || {};
  const street = [address.road || address.pedestrian || address.footway, address.house_number]
    .filter(Boolean)
    .join(" ");
  const place = address.city || address.town || address.village || address.municipality || address.county;
  const area = address.suburb || address.neighbourhood || address.quarter;
  const label = street || result.name || place || result.display_name?.split(",")[0] || "Избрана точка";
  const detail = [area, place].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(", ") || "България";

  return {
    label,
    detail,
    lat: Number(result.lat),
    lng: Number(result.lon)
  };
}

function addLocationBias(params, location) {
  if (!isValidLocation(location)) return;

  const latitude = Number(location.lat);
  const longitude = Number(location.lng);
  const delta = 0.45;
  params.set("viewbox", `${longitude - delta},${latitude + delta},${longitude + delta},${latitude - delta}`);
}

function isValidLocation(location) {
  return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng));
}
