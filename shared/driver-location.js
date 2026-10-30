export const GPS_FRESH_MS = 20000;
export const GPS_VISIBLE_MS = 120000;
export const GPS_SAMPLE_MAX_AGE_MS = 30000;
export const GPS_PUBLISH_MS = 5000;

export function validDriverPosition(value) {
  return value && typeof value.lat === "number" && typeof value.lng === "number"
    && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180
    && typeof value.accuracy === "number" && Number.isFinite(value.accuracy)
    && value.accuracy >= 0 && value.accuracy <= 500;
}

export function driverLocationState(location, time = Date.now()) {
  if (!validDriverPosition(location)) return "missing";
  const timestamp = Date.parse(location.updatedAt);
  if (!Number.isFinite(timestamp) || time - timestamp >= GPS_VISIBLE_MS) return "missing";
  return time - timestamp > GPS_FRESH_MS ? "stale" : "fresh";
}
