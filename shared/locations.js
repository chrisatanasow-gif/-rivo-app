export function isValidLocation(location) {
  return typeof location?.lat === "number" && typeof location?.lng === "number"
    && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180;
}

export function routeKey(start, end) {
  return isValidLocation(start) && isValidLocation(end) ? [start.lat, start.lng, end.lat, end.lng].join(",") : null;
}
